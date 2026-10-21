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
from django.db.models import F, Q
from django.utils import timezone

from .models import Event, Expense, Group, Member
from .accounts import avatar_path
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
    "members": ["group_id", "name", "invite_username", "deleted"],
    "events": ["group_id", "title", "starts_at", "ends_at", "location", "notes", "deleted"],
    "expenses": ["group_id", "event_id", "name", "amount_cents", "spent_at", "due_at", "splits", "deleted"],
}

# Sent on pull only; a push can't set them. Who owns a group, and which account joined as a person.
READ_ONLY = {
    "groups": {"owner_username": F("owner__username")},
    "members": {"joined_username": F("user__username"), "joined_avatar": F("user__profile__avatar")},
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
    since = last_pulled_at - OVERLAP if last_pulled_at else None
    # Groups this user just joined: their old rows predate last_pulled_at, so send them whole.
    joined = (
        set(
            Member.objects.filter(
                user=user, deleted=False, group_id__in=group_ids, updated_at__gt=since
            ).values_list("group_id", flat=True)
        )
        if since
        else set()
    )
    changes = {}
    for table, model in TABLES.items():
        key = "id" if model is Group else "group_id"
        scope = Q(**{f"{key}__in": group_ids})
        if model is Event:
            scope |= Q(group__isnull=True, owner=user)  # personal events
        qs = model.objects.filter(scope)
        if since:
            qs = qs.filter(Q(updated_at__gt=since) | Q(**{f"{key}__in": joined}))
        else:
            qs = qs.filter(deleted=False)  # first sync: no need to send tombstones
        extra = READ_ONLY.get(table, {})
        changes[table] = list(qs.annotate(**extra).values("id", *FIELDS[table], *extra))
    return {
        "changes": changes,
        "timestamp": timestamp.isoformat(),
        # Every group this user may see. The phone drops local copies of any others
        # (e.g. after being removed from a budget).
        "group_ids": [str(g) for g in group_ids],
        "username": user.get_username(),
        "avatar": avatar_path(user),  # this account's photo, so the phone can show it offline
    }


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


def normalize_username(value):
    """'  @Ana ' -> 'Ana'. Matching is case-insensitive, so case is kept as typed."""
    return str(value or "").strip().lstrip("@").strip()


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
    elif table == "events" and (obj.group_id is None if obj else not data.get("group_id")):
        # A personal event: no group, and only its owner can see or change it.
        data.pop("group_id", None)
        if obj and obj.owner_id != user.id:
            raise SyncError(f"events {pk}: that event isn't yours.")
        if not obj:
            obj = Event(id=pk, owner=user)
        group_id = None
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
    if table == "members" and "invite_username" in data:
        data["invite_username"] = normalize_username(data["invite_username"])
        _link_owner_to_self(user, obj, data, group_id)

    for field, value in data.items():
        setattr(obj, field, value)
    try:
        obj.full_clean()
    except ValidationError as e:
        raise SyncError(f"{table} {pk}: {e.message_dict}")
    obj.save()


def _link_owner_to_self(user, obj, data, group_id):
    """The owner adding a person with their *own* username means "this is me": link it now.

    That's how a new budget includes its creator (the phone adds them as a person), and it
    works offline because it rides along with the normal push. Nobody else can link an
    account through a push; everyone else accepts an invite with POST /members/<id>/join/.
    """
    invite = data.get("invite_username", "")
    if obj.user_id or not invite or invite.lower() != user.get_username().lower():
        return
    if not Group.objects.filter(pk=group_id, owner=user).exists():
        return
    if Member.objects.filter(group_id=group_id, user=user, deleted=False).exclude(pk=obj.pk).exists():
        return  # already in this budget as someone else
    obj.user = user
    data["invite_username"] = ""


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
    if not all(isinstance(s, dict) for s in splits):
        raise SyncError("Each split must be an object.")
    fixed = [bool(s.get("fixed")) for s in splits]
    if any(fixed) and not all(fixed):
        raise SyncError("Use either shares or exact amounts for an expense, not both.")
    exact = all(fixed)

    clean = []
    for s in splits:
        mid = _uuid(s.get("member_id"), "splits.member_id")
        if mid not in member_ids:
            raise SyncError(f"Member {mid} is not in this group.")
        entry = {"member_id": str(mid), "weight": s.get("weight", 1)}
        if exact:
            share = s.get("amount_cents")
            if not isinstance(share, int) or share < 0:
                raise SyncError("Each person's amount must be a whole number of centavos, zero or more.")
            entry.update(amount_cents=share, fixed=True)
        clean.append(entry)

    if exact:
        # Typed-in amounts are kept, but they must account for the whole expense.
        if sum(s["amount_cents"] for s in clean) != amount:
            raise SyncError("The people's amounts must add up to the expense amount.")
    else:
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
