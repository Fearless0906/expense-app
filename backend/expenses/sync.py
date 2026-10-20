"""Offline sync: the phone pushes its local changes, then pulls everything that
changed on the server since its last pull.

Protocol (same shape WatermelonDB uses, so you can switch to it later):

  POST /api/sync/push/   {"changes": {"groups": [row, ...], "members": [...], ...}}
  GET  /api/sync/pull/?last_pulled_at=<iso>
       -> {"changes": {"groups": [row, ...], ...}, "timestamp": "<iso>"}

Conflicts: last write wins per record (the push the server receives last).
Balances are never stored, only computed from expenses, so two phones adding
expenses offline at the same time can never overwrite each other's totals.
"""

import uuid
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import Event, Expense, Group, Member
from .split import split_amount

# Parents before children, so a group created offline is saved before its members.
TABLES = {
    "groups": Group,
    "members": Member,
    "events": Event,
    "expenses": Expense,
}

# Columns the phone is allowed to send and receives back.
FIELDS = {
    "groups": ["name", "credit_limit_cents", "currency", "deleted"],
    "members": ["group_id", "name", "deleted"],
    "events": ["group_id", "title", "starts_at", "ends_at", "location", "notes", "deleted"],
    "expenses": ["group_id", "event_id", "name", "amount_cents", "spent_at", "splits", "deleted"],
}

# A row saved just before a pull but committed just after it would be missed.
# Re-sending the last few seconds closes that gap; the phone's upsert makes repeats harmless.
OVERLAP = timedelta(seconds=5)


class SyncError(Exception):
    pass


def accessible_groups(user):
    return Group.objects.filter(
        Q(owner=user) | Q(members__user=user, members__deleted=False)
    ).distinct()


def pull(user, last_pulled_at):
    timestamp = timezone.now()  # taken before querying, so nothing saved after it is skipped
    group_ids = list(accessible_groups(user).values_list("id", flat=True))
    changes = {}
    for table, model in TABLES.items():
        qs = model.objects.filter(id__in=group_ids) if model is Group else model.objects.filter(
            group_id__in=group_ids
        )
        if last_pulled_at:
            qs = qs.filter(updated_at__gt=last_pulled_at - OVERLAP)
        else:
            qs = qs.filter(deleted=False)  # first sync: no need to send tombstones
        changes[table] = list(qs.values("id", *FIELDS[table]))
    return {"changes": changes, "timestamp": timestamp.isoformat()}


def push(user, changes):
    if not isinstance(changes, dict):
        raise SyncError("changes must be an object")
    allowed = set(accessible_groups(user).values_list("id", flat=True))
    with transaction.atomic():
        for table, model in TABLES.items():
            rows = changes.get(table) or []
            if not isinstance(rows, list):
                raise SyncError(f"{table} must be a list")
            for row in rows:
                _apply(user, table, model, row, allowed)


def _uuid(value, what):
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        raise SyncError(f"{what} is not a valid id: {value!r}")


def _apply(user, table, model, row, allowed):
    if not isinstance(row, dict):
        raise SyncError(f"{table}: each row must be an object")
    pk = _uuid(row.get("id"), f"{table}.id")
    data = {f: row[f] for f in FIELDS[table] if f in row}
    obj = model.objects.select_for_update().filter(pk=pk).first()

    if table == "groups":
        if obj and obj.owner_id != user.id:
            raise SyncError("Only the group owner can change the group or its credit limit.")
        if not obj:
            obj = Group(id=pk, owner=user)
            allowed.add(pk)
    else:
        if obj:
            group_id = obj.group_id  # rows can't be moved to another group
            data.pop("group_id", None)
        else:
            group_id = _uuid(data.get("group_id"), f"{table}.group_id")
            obj = model(id=pk)
        if group_id not in allowed:
            raise SyncError(f"{table} {pk}: you don't have access to that group.")

    if table == "expenses":
        _prepare_expense(obj, data, group_id)

    for field, value in data.items():
        setattr(obj, field, value)
    try:
        obj.full_clean()
    except ValidationError as e:
        raise SyncError(f"{table} {pk}: {e.message_dict}")
    obj.save()


def _prepare_expense(obj, data, group_id):
    if "event_id" in data:
        event_id = data["event_id"]
        if event_id:
            event_id = _uuid(event_id, "expenses.event_id")
            if not Event.objects.filter(pk=event_id, group_id=group_id).exists():
                event_id = None  # event missing or in another group: just unlink it
        data["event_id"] = event_id or None

    amount = data.get("amount_cents", obj.amount_cents)
    splits = data.get("splits", obj.splits)
    deleted = data.get("deleted", obj.deleted)
    if deleted:
        return
    if not isinstance(amount, int) or amount < 0:
        raise SyncError("amount_cents must be a whole number, zero or more.")
    if not isinstance(splits, list) or not splits:
        raise SyncError("An expense needs at least one person in splits.")

    member_ids = set(
        Member.objects.filter(group_id=group_id).values_list("id", flat=True)
    )
    clean = []
    for s in splits:
        if not isinstance(s, dict):
            raise SyncError("Each split must be an object.")
        mid = _uuid(s.get("member_id"), "splits.member_id")
        if mid not in member_ids:
            raise SyncError(f"Member {mid} is not in this group.")
        clean.append({"member_id": str(mid), "weight": s.get("weight", 1)})
    try:
        shares = split_amount(amount, [s["weight"] for s in clean])
    except ValueError as e:
        raise SyncError(str(e))
    # The server recomputes the shares so they always add up to the amount.
    for s, share in zip(clean, shares):
        s["amount_cents"] = share
    data["splits"] = clean


def group_summary(group):
    """Credit limit, spent, remaining, and how much each member used."""
    expenses = group.expenses.filter(deleted=False)
    spent = 0
    used = {}
    for e in expenses:
        spent += e.amount_cents
        for s in e.splits:
            used[s["member_id"]] = used.get(s["member_id"], 0) + s["amount_cents"]
    members = [
        {"id": str(m.id), "name": m.name, "used_cents": used.get(str(m.id), 0)}
        for m in group.members.filter(deleted=False)
    ]
    return {
        "id": str(group.id),
        "name": group.name,
        "credit_limit_cents": group.credit_limit_cents,
        "spent_cents": spent,
        "remaining_cents": group.credit_limit_cents - spent,
        "members": members,
    }
