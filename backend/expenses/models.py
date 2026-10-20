import uuid

from django.conf import settings
from django.db import models


class SyncModel(models.Model):
    """Base for every table the phone keeps an offline copy of.

    - id is a UUID made on the phone, so records created offline never collide.
    - updated_at is stamped by the server on every write; pull uses it to find changes.
    - deleted is a soft delete ("tombstone") so a delete can reach other phones.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)
    deleted = models.BooleanField(default=False)

    class Meta:
        abstract = True


class Group(SyncModel):
    """A budget pool, e.g. 'Office Christmas party' with a ₱10,000 credit limit."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="owned_groups"
    )
    name = models.CharField(max_length=120)
    credit_limit_cents = models.BigIntegerField(default=0)
    currency = models.CharField(max_length=3, default="PHP")

    def __str__(self):
        return self.name


class Member(SyncModel):
    """A person who can share in expenses. Does not need an app account."""

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="members")
    name = models.CharField(max_length=120)
    # Optional: link to an account so that person can sync this group on their phone too.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="memberships",
    )

    def __str__(self):
        return self.name


class Event(SyncModel):
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="events")
    title = models.CharField(max_length=200)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField(null=True, blank=True)
    location = models.CharField(max_length=200, blank=True, default="")
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["starts_at"]

    def __str__(self):
        return self.title


class Expense(SyncModel):
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="expenses")
    event = models.ForeignKey(
        Event, null=True, blank=True, on_delete=models.SET_NULL, related_name="expenses"
    )
    name = models.CharField(max_length=200)
    amount_cents = models.BigIntegerField()
    spent_at = models.DateTimeField()
    # Who was involved and their share, e.g.
    # [{"member_id": "<uuid>", "weight": 1, "amount_cents": 16667}, ...]
    # Kept inside the expense (not a separate table) so an expense and its split
    # always sync together as one record and can never get out of step.
    splits = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["-spent_at"]

    def __str__(self):
        return f"{self.name} ({self.amount_cents / 100:.2f})"
