import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Expense, Group
from .split import split_amount


class SplitTests(TestCase):
    def test_equal_split_adds_up(self):
        self.assertEqual(split_amount(50000, [1, 1, 1]), [16667, 16667, 16666])

    def test_weighted_split(self):
        self.assertEqual(split_amount(50000, [2, 1, 1]), [25000, 12500, 12500])

    def test_always_sums_to_amount(self):
        for amount in [1, 2, 99, 100, 12345, 50000, 999999]:
            for weights in [[1], [1, 1], [1, 1, 1], [3, 2, 1], [1, 1, 1, 1, 1, 1, 1]]:
                self.assertEqual(sum(split_amount(amount, weights)), amount)

    def test_needs_someone(self):
        with self.assertRaises(ValueError):
            split_amount(100, [])


class SyncTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.ana = User.objects.create_user("ana", password="x-very-long-pass")
        self.ben = User.objects.create_user("ben", password="x-very-long-pass")
        self.client = APIClient()
        self.client.force_authenticate(self.ana)
        self.gid, self.m1, self.m2, self.m3 = (str(uuid.uuid4()) for _ in range(4))
        self.eid, self.xid = str(uuid.uuid4()), str(uuid.uuid4())

    def push(self, changes, client=None):
        return (client or self.client).post("/api/sync/push/", {"changes": changes}, format="json")

    def seed(self):
        now = timezone.now().isoformat()
        r = self.push({
            "groups": [{"id": self.gid, "name": "Org fair", "credit_limit_cents": 1000000, "deleted": False}],
            "members": [
                {"id": m, "group_id": self.gid, "name": n, "deleted": False}
                for m, n in [(self.m1, "Ana"), (self.m2, "Ben"), (self.m3, "Cris")]
            ],
            "events": [{"id": self.eid, "group_id": self.gid, "title": "Booth setup",
                        "starts_at": now, "ends_at": None, "location": "", "notes": "", "deleted": False}],
            "expenses": [{
                "id": self.xid, "group_id": self.gid, "event_id": self.eid, "name": "Printables",
                "amount_cents": 50000, "spent_at": now, "deleted": False,
                # phone sent wrong shares on purpose: server must fix them
                "splits": [{"member_id": m, "weight": 1, "amount_cents": 1} for m in (self.m1, self.m2, self.m3)],
            }],
        })
        self.assertEqual(r.status_code, 200, r.data)

    def test_push_then_pull_and_summary(self):
        self.seed()
        pulled = self.client.get("/api/sync/pull/").data
        self.assertEqual(len(pulled["changes"]["members"]), 3)
        splits = pulled["changes"]["expenses"][0]["splits"]
        self.assertEqual([s["amount_cents"] for s in splits], [16667, 16667, 16666])

        s = self.client.get(f"/api/groups/{self.gid}/summary/").data
        self.assertEqual(s["spent_cents"], 50000)
        self.assertEqual(s["remaining_cents"], 950000)

    def test_incremental_pull_returns_only_changes_and_tombstones(self):
        self.seed()
        Expense.objects.update(updated_at=timezone.now() - timedelta(minutes=10))
        Group.objects.update(updated_at=timezone.now() - timedelta(minutes=10))
        since = (timezone.now() - timedelta(minutes=1)).isoformat()
        self.push({"expenses": [{"id": self.xid, "deleted": True}]})
        pulled = self.client.get("/api/sync/pull/", {"last_pulled_at": since}).data
        self.assertEqual(pulled["changes"]["groups"], [])
        self.assertTrue(pulled["changes"]["expenses"][0]["deleted"])

    def test_other_user_cannot_touch_group(self):
        self.seed()
        other = APIClient()
        other.force_authenticate(self.ben)
        r = self.push({"groups": [{"id": self.gid, "name": "hacked", "credit_limit_cents": 1}]}, other)
        self.assertEqual(r.status_code, 400)
        r = self.push({"members": [{"id": str(uuid.uuid4()), "group_id": self.gid, "name": "x"}]}, other)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(other.get("/api/sync/pull/").data["changes"]["groups"], [])

    def test_linked_member_can_sync_group(self):
        self.seed()
        from .models import Member
        Member.objects.filter(pk=self.m2).update(user=self.ben)
        other = APIClient()
        other.force_authenticate(self.ben)
        self.assertEqual(len(other.get("/api/sync/pull/").data["changes"]["expenses"]), 1)

    def test_bad_push_saves_nothing(self):
        r = self.push({
            "groups": [{"id": self.gid, "name": "G", "credit_limit_cents": 100}],
            "expenses": [{"id": self.xid, "group_id": self.gid, "name": "x", "amount_cents": 100,
                          "spent_at": timezone.now().isoformat(), "splits": []}],
        })
        self.assertEqual(r.status_code, 400)
        self.assertFalse(Group.objects.exists())

    def test_register_and_login(self):
        anon = APIClient()
        r = anon.post("/api/auth/register/", {"username": "cris", "password": "a-long-password-123"}, format="json")
        self.assertEqual(r.status_code, 201)
        r = anon.post("/api/auth/login/", {"username": "cris", "password": "a-long-password-123"}, format="json")
        self.assertIn("token", r.data)
