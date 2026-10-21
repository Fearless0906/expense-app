"""Invites: a person in a budget can be invited by username; accepting links that account.

Flow:
  1. Someone in the budget sets Member.invite_username (through a normal sync push).
  2. The invited user sees it in GET /api/invitations/ (it isn't in their sync yet:
     a pending invite grants no access).
  3. POST /api/members/<id>/join/ links Member.user to them and clears the invite. That gives
     access, and their next pull sends the whole budget (see `joined` in sync.pull).
  4. POST /api/members/<id>/decline/ clears the invite.

The budget's owner can also join as any unlinked person ("This is me"), so the owner
can see their own share too.
"""

from django.db import transaction

from .models import Member


class InviteError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def _invited(member, user):
    return bool(member.invite_username) and member.invite_username.lower() == user.get_username().lower()


def _my_group_ids(user):
    return set(Member.objects.filter(user=user, deleted=False).values_list("group_id", flat=True))


def pending_invitations(user):
    already_in = _my_group_ids(user)
    members = (
        Member.objects.filter(
            invite_username__iexact=user.get_username(),
            user__isnull=True,
            deleted=False,
            group__deleted=False,
        )
        .select_related("group", "group__owner")
        .order_by("-updated_at")
    )
    return [
        {
            "member_id": str(m.id),
            "member_name": m.name,
            "group_id": str(m.group_id),
            "group_name": m.group.name,
            "owner_username": m.group.owner.get_username(),
            "credit_limit_cents": m.group.credit_limit_cents,
        }
        for m in members
        if m.group_id not in already_in
    ]


def join(user, member_id):
    with transaction.atomic():
        member = (
            Member.objects.select_for_update()
            .select_related("group")
            .filter(pk=member_id, deleted=False, group__deleted=False)
            .first()
        )
        is_owner = member is not None and member.group.owner_id == user.id
        if member is None or not (_invited(member, user) or is_owner):
            raise InviteError("That invitation isn't available any more.", status=404)
        if member.user_id is not None:
            raise InviteError("Someone has already joined as this person.")
        mine = Member.objects.filter(group_id=member.group_id, user=user, deleted=False).first()
        if mine:
            raise InviteError(f"You're already in this budget as {mine.name}.")
        member.user = user
        member.invite_username = ""
        member.save()  # bumps updated_at, which makes the next pull send the whole budget
    return member


def decline(user, member_id):
    with transaction.atomic():
        member = Member.objects.select_for_update().filter(pk=member_id, user__isnull=True).first()
        if member is None or not _invited(member, user):
            raise InviteError("That invitation isn't available any more.", status=404)
        member.invite_username = ""
        member.save()
