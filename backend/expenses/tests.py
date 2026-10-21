import tempfile
import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Event, Expense, Group, Member
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


class SyncFixtures(TestCase):
    """ana owns nothing yet; seed() pushes "Org fair" with people Ana, Ben, Cris."""

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


class SyncTests(SyncFixtures):
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
        r = anon.post("/api/auth/register/", {"username": "cris", "email": "cris@example.com", "password": "a-long-password-123"}, format="json")
        self.assertEqual(r.status_code, 201)
        r = anon.post("/api/auth/login/", {"username": "cris", "password": "a-long-password-123"}, format="json")
        self.assertIn("token", r.data)


class InviteTests(SyncFixtures):

    def setUp(self):
        super().setUp()
        self.seed()
        self.ben_client = APIClient()
        self.ben_client.force_authenticate(self.ben)
        # A long time passes; ben's phone last synced a minute ago.
        for model in (Group, Member, Event, Expense):
            model.objects.update(updated_at=timezone.now() - timedelta(minutes=10))
        self.since = (timezone.now() - timedelta(minutes=1)).isoformat()

    def invite_ben(self, username="  @Ben "):
        r = self.push({"members": [{"id": self.m2, "invite_username": username}]})
        self.assertEqual(r.status_code, 200, r.data)

    def test_pending_invite_shows_but_grants_no_access(self):
        self.invite_ben()
        self.assertEqual(Member.objects.get(pk=self.m2).invite_username, "Ben")
        inv = self.ben_client.get("/api/invitations/").data
        self.assertEqual([(i["group_name"], i["member_name"], i["owner_username"]) for i in inv],
                         [("Org fair", "Ben", "ana")])
        self.assertEqual(self.ben_client.get("/api/sync/pull/").data["group_ids"], [])

    def test_accept_then_incremental_pull_sends_whole_budget(self):
        self.invite_ben()
        r = self.ben_client.post(f"/api/members/{self.m2}/join/")
        self.assertEqual(r.status_code, 200, r.data)
        pulled = self.ben_client.get("/api/sync/pull/", {"last_pulled_at": self.since}).data
        self.assertEqual(pulled["group_ids"], [self.gid])
        self.assertEqual(pulled["username"], "ben")
        self.assertEqual(len(pulled["changes"]["groups"]), 1)
        self.assertEqual(pulled["changes"]["groups"][0]["owner_username"], "ana")
        self.assertEqual(len(pulled["changes"]["expenses"]), 1)  # old row, sent because ben just joined
        joined = {str(m["id"]): m["joined_username"] for m in pulled["changes"]["members"]}
        self.assertEqual(joined[self.m2], "ben")
        self.assertEqual(self.ben_client.get("/api/invitations/").data, [])
        # ben can now add expenses to the budget
        self.assertEqual(self.push({"members": [{"id": str(uuid.uuid4()), "group_id": self.gid, "name": "Dan"}]},
                                   self.ben_client).status_code, 200)

    def test_decline_clears_invite(self):
        self.invite_ben()
        self.assertEqual(self.ben_client.post(f"/api/members/{self.m2}/decline/").status_code, 200)
        self.assertEqual(Member.objects.get(pk=self.m2).invite_username, "")
        self.assertEqual(self.ben_client.post(f"/api/members/{self.m2}/join/").status_code, 404)

    def test_uninvited_user_cannot_join(self):
        self.assertEqual(self.ben_client.post(f"/api/members/{self.m2}/join/").status_code, 404)
        self.assertIsNone(Member.objects.get(pk=self.m2).user)

    def test_owner_can_join_as_a_person_once(self):
        self.assertEqual(self.client.post(f"/api/members/{self.m1}/join/").status_code, 200)
        r = self.client.post(f"/api/members/{self.m3}/join/")
        self.assertEqual(r.status_code, 400)
        self.assertIn("already in this budget as Ana", r.data["detail"])

    def test_cannot_join_as_someone_already_linked(self):
        Member.objects.filter(pk=self.m2).update(user=self.ana, invite_username="ben")
        self.assertEqual(self.ben_client.post(f"/api/members/{self.m2}/join/").status_code, 400)

    def test_removed_person_loses_access(self):
        self.invite_ben()
        self.ben_client.post(f"/api/members/{self.m2}/join/")
        self.push({"members": [{"id": self.m2, "deleted": True}]})
        self.assertEqual(self.ben_client.get("/api/sync/pull/").data["group_ids"], [])

    def test_push_cannot_link_an_account(self):
        self.push({"members": [{"id": self.m2, "user_id": self.ben.id, "joined_username": "ben"}]})
        self.assertIsNone(Member.objects.get(pk=self.m2).user)

    def test_user_exists(self):
        self.assertTrue(self.client.get("/api/users/exists/", {"username": "@BEN"}).data["exists"])
        self.assertFalse(self.client.get("/api/users/exists/", {"username": "nobody"}).data["exists"])

    def test_owner_adding_own_username_links_immediately(self):
        me = str(uuid.uuid4())
        r = self.push({"members": [{"id": me, "group_id": self.gid, "name": "Ana", "invite_username": "ANA"}]})
        self.assertEqual(r.status_code, 200, r.data)
        m = Member.objects.get(pk=me)
        self.assertEqual((m.user, m.invite_username), (self.ana, ""))
        joined = {str(x["id"]): x["joined_username"] for x in self.client.get("/api/sync/pull/").data["changes"]["members"]}
        self.assertEqual(joined[me], "ana")

    def test_non_owner_cannot_self_link_by_push(self):
        Member.objects.filter(pk=self.m2).update(user=self.ben)  # ben is in the budget
        new = str(uuid.uuid4())
        self.push({"members": [{"id": new, "group_id": self.gid, "name": "Ben 2", "invite_username": "ben"}]}, self.ben_client)
        m = Member.objects.get(pk=new)
        self.assertIsNone(m.user)  # stays a pending invite; ben isn't the owner


class ExactAmountsAndDueDateTests(SyncFixtures):
    def setUp(self):
        super().setUp()
        self.seed()

    def push_expense(self, splits, **extra):
        return self.push({"expenses": [{
            "id": str(uuid.uuid4()), "group_id": self.gid, "name": "Snacks", "amount_cents": 30000,
            "spent_at": timezone.now().isoformat(), "splits": splits, "deleted": False, **extra,
        }]})

    def test_exact_amounts_are_kept(self):
        r = self.push_expense([
            {"member_id": self.m1, "amount_cents": 20000, "fixed": True},
            {"member_id": self.m2, "amount_cents": 10000, "fixed": True},
        ])
        self.assertEqual(r.status_code, 200, r.data)
        x = Expense.objects.get(name="Snacks")
        self.assertEqual([s["amount_cents"] for s in x.splits], [20000, 10000])
        self.assertTrue(all(s["fixed"] for s in x.splits))

    def test_exact_amounts_must_add_up(self):
        r = self.push_expense([
            {"member_id": self.m1, "amount_cents": 20000, "fixed": True},
            {"member_id": self.m2, "amount_cents": 5000, "fixed": True},
        ])
        self.assertEqual(r.status_code, 400)
        self.assertFalse(Expense.objects.filter(name="Snacks").exists())

    def test_cannot_mix_shares_and_exact_amounts(self):
        r = self.push_expense([
            {"member_id": self.m1, "amount_cents": 20000, "fixed": True},
            {"member_id": self.m2, "weight": 1},
        ])
        self.assertEqual(r.status_code, 400)

    def test_due_date_round_trips(self):
        due = (timezone.now() + timedelta(days=3)).replace(microsecond=0)
        r = self.push_expense([{"member_id": self.m1, "weight": 1}], due_at=due.isoformat())
        self.assertEqual(r.status_code, 200, r.data)
        pulled = self.client.get("/api/sync/pull/").data["changes"]["expenses"]
        x = next(e for e in pulled if e["name"] == "Snacks")
        self.assertEqual(x["due_at"], due)



class AccountTests(TestCase):
    def setUp(self):
        self.anon = APIClient()

    def post(self, path, data, client=None):
        return (client or self.anon).post(path, data, format="json")

    def register(self, username="dana", email="dana@example.com", password="a-long-password-123"):
        return self.post("/api/auth/register/", {"username": username, "email": email, "password": password})

    def code_from_email(self):
        import re
        return re.search(r"\b(\d{6})\b", mail.outbox[-1].body).group(1)

    def test_register_needs_a_valid_unique_email(self):
        self.assertEqual(self.register(email="not-an-email").status_code, 400)
        self.assertEqual(self.register().status_code, 201)
        r = self.register(username="dana2", email="DANA@example.com")
        self.assertEqual(r.status_code, 400)
        self.assertIn("email", r.data["detail"])

    def test_login_with_username_or_email(self):
        self.register()
        for who in ["dana", "DANA", "dana@example.com", "Dana@Example.com"]:
            r = self.post("/api/auth/login/", {"identifier": who, "password": "a-long-password-123"})
            self.assertEqual(r.status_code, 200, who)
            self.assertEqual(r.data["username"], "dana")
        self.assertEqual(self.post("/api/auth/login/", {"identifier": "dana", "password": "wrong"}).status_code, 400)

    def test_forgot_password_does_not_reveal_accounts(self):
        self.register()
        known = self.post("/api/auth/password/forgot/", {"identifier": "dana"})
        unknown = self.post("/api/auth/password/forgot/", {"identifier": "nobody"})
        self.assertEqual((known.status_code, unknown.status_code), (200, 200))
        self.assertEqual(known.data, unknown.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["dana@example.com"])

    def test_reset_password_with_code(self):
        token = self.register().data["token"]
        other_phone = APIClient()
        other_phone.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        self.post("/api/auth/password/forgot/", {"identifier": "dana@example.com"})
        code = self.code_from_email()
        r = self.post("/api/auth/password/reset/", {"identifier": "dana", "code": code, "password": "brand-new-pass-456"})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn("token", r.data)
        # the old password no longer works, the new one does, and the other phone is signed out
        self.assertEqual(self.post("/api/auth/login/", {"identifier": "dana", "password": "a-long-password-123"}).status_code, 400)
        self.assertEqual(self.post("/api/auth/login/", {"identifier": "dana", "password": "brand-new-pass-456"}).status_code, 200)
        self.assertEqual(other_phone.get("/api/auth/me/").status_code, 401)
        # a code works once
        again = self.post("/api/auth/password/reset/", {"identifier": "dana", "code": code, "password": "another-pass-789"})
        self.assertEqual(again.status_code, 400)

    def test_too_many_wrong_codes_cancel_the_code(self):
        self.register()
        self.post("/api/auth/password/forgot/", {"identifier": "dana"})
        code = self.code_from_email()
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(5):
            self.post("/api/auth/password/reset/", {"identifier": "dana", "code": wrong, "password": "brand-new-pass-456"})
        r = self.post("/api/auth/password/reset/", {"identifier": "dana", "code": code, "password": "brand-new-pass-456"})
        self.assertEqual(r.status_code, 400)

    def test_weak_new_password_keeps_the_code_usable(self):
        self.register()
        self.post("/api/auth/password/forgot/", {"identifier": "dana"})
        code = self.code_from_email()
        self.assertEqual(self.post("/api/auth/password/reset/", {"identifier": "dana", "code": code, "password": "123"}).status_code, 400)
        self.assertEqual(self.post("/api/auth/password/reset/", {"identifier": "dana", "code": code, "password": "brand-new-pass-456"}).status_code, 200)

    def test_one_code_a_minute(self):
        self.register()
        self.post("/api/auth/password/forgot/", {"identifier": "dana"})
        self.post("/api/auth/password/forgot/", {"identifier": "dana"})
        self.assertEqual(len(mail.outbox), 1)

    def test_add_email_to_older_account(self):
        from django.contrib.auth import get_user_model
        user = get_user_model().objects.create_user("old", password="a-long-password-123")
        c = APIClient()
        c.force_authenticate(user)
        self.assertEqual(c.get("/api/auth/me/").data, {"username": "old", "email": "", "avatar": ""})
        self.assertEqual(self.post("/api/auth/me/", {"email": "bad"}, c).status_code, 400)
        r = self.post("/api/auth/me/", {"email": "old@example.com"}, c)
        self.assertEqual(r.data["email"], "old@example.com")


def _png_upload(name="me.png"):
    import io

    from django.core.files.uploadedfile import SimpleUploadedFile
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (15, 122, 95)).save(buf, format="PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(prefix="hati-test-media-"))
class AccountSettingsTests(SyncFixtures):
    def setUp(self):
        super().setUp()
        self.seed()
        Member.objects.filter(pk=self.m1).update(user=self.ana)
        self.ana.set_password("a-long-password-123")
        self.ana.save()

    def test_photo_upload_shows_for_others_and_can_be_removed(self):
        self.ben_client = APIClient()
        self.ben_client.force_authenticate(self.ben)
        Member.objects.filter(pk=self.m2).update(user=self.ben)
        since = (timezone.now()).isoformat()
        r = self.client.post("/api/auth/avatar/", {"avatar": _png_upload()}, format="multipart")
        self.assertEqual(r.status_code, 200, r.data)
        path = r.data["avatar"]
        self.assertTrue(path.startswith("avatars/"))
        # ben's next incremental pull carries ana's new photo on her person row
        pulled = self.ben_client.get("/api/sync/pull/", {"last_pulled_at": since}).data
        joined = {str(m["id"]): m["joined_avatar"] for m in pulled["changes"]["members"]}
        self.assertEqual(joined[self.m1], path)
        self.assertEqual(self.client.get("/api/sync/pull/").data["avatar"], path)
        self.assertEqual(self.client.delete("/api/auth/avatar/").data["avatar"], "")

    def test_rejects_files_that_are_not_photos(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        bad = SimpleUploadedFile("x.png", b"not really an image", content_type="image/png")
        self.assertEqual(self.client.post("/api/auth/avatar/", {"avatar": bad}, format="multipart").status_code, 400)

    def test_change_password_signs_out_other_phones(self):
        anon = APIClient()
        old_token = anon.post("/api/auth/login/", {"identifier": "ana", "password": "a-long-password-123"}, format="json").data["token"]
        r = self.client.post("/api/auth/password/change/", {"current_password": "wrong", "password": "brand-new-pass-456"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/api/auth/password/change/", {"current_password": "a-long-password-123", "password": "brand-new-pass-456"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertNotEqual(r.data["token"], old_token)
        other = APIClient()
        other.credentials(HTTP_AUTHORIZATION=f"Token {old_token}")
        self.assertEqual(other.get("/api/auth/me/").status_code, 401)

    def test_sign_out_other_phones_gives_this_phone_a_new_token(self):
        anon = APIClient()
        old = anon.post("/api/auth/login/", {"identifier": "ana", "password": "a-long-password-123"}, format="json").data["token"]
        new = self.client.post("/api/auth/sessions/others/").data["token"]
        self.assertNotEqual(old, new)
        phone = APIClient()
        phone.credentials(HTTP_AUTHORIZATION=f"Token {old}")
        self.assertEqual(phone.get("/api/auth/me/").status_code, 401)

    def test_delete_account_needs_password_and_removes_owned_budgets(self):
        self.assertEqual(self.client.post("/api/auth/delete/", {"password": "nope"}, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/auth/delete/", {"password": "a-long-password-123"}, format="json").status_code, 200)
        from django.contrib.auth import get_user_model

        self.assertFalse(get_user_model().objects.filter(username="ana").exists())
        self.assertFalse(Group.objects.filter(pk=self.gid).exists())


class PersonalEventTests(SyncFixtures):
    def event(self, eid, **extra):
        row = {"id": eid, "title": "Defense", "starts_at": timezone.now().isoformat(), "ends_at": None,
               "location": "", "notes": "", "deleted": False, "group_id": None}
        row.update(extra)
        return row

    def test_personal_event_needs_no_budget_and_only_its_owner_sees_it(self):
        eid = str(uuid.uuid4())
        r = self.push({"events": [self.event(eid)]})
        self.assertEqual(r.status_code, 200, r.data)
        mine = self.client.get("/api/sync/pull/").data["changes"]["events"]
        self.assertEqual([str(e["id"]) for e in mine], [eid])
        self.assertIsNone(mine[0]["group_id"])

        ben = APIClient()
        ben.force_authenticate(self.ben)
        self.assertEqual(ben.get("/api/sync/pull/").data["changes"]["events"], [])
        # ben can't edit or delete it either
        r = self.push({"events": [self.event(eid, title="Hacked", deleted=True)]}, client=ben)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(Event.objects.get(pk=eid).title, "Defense")

    def test_owner_can_edit_and_delete_a_personal_event(self):
        eid = str(uuid.uuid4())
        self.push({"events": [self.event(eid)]})
        r = self.push({"events": [self.event(eid, title="Final defense", deleted=True)]})
        self.assertEqual(r.status_code, 200, r.data)
        e = Event.objects.get(pk=eid)
        self.assertEqual((e.title, e.deleted, e.group_id, e.owner_id), ("Final defense", True, None, self.ana.id))

    def test_budget_events_still_sync_to_the_budget(self):
        self.seed()
        pulled = self.client.get("/api/sync/pull/").data["changes"]["events"]
        self.assertEqual([str(e["group_id"]) for e in pulled], [self.gid])


class ApiRootTests(TestCase):
    def test_api_root_is_public_and_lists_endpoints(self):
        r = APIClient().get("/api/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["status"], "ok")
        self.assertIn("POST auth/login/", r.data["endpoints"]["auth"])

    def test_home_redirects_to_api(self):
        r = APIClient().get("/")
        self.assertEqual((r.status_code, r["Location"]), (302, "/api/"))

