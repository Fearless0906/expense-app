# Hati — shared expenses against a credit limit

Django + DRF backend, Expo app (SDK 57, Expo Router, SQLite). The app works fully offline and syncs when it's back online.

"Hati" is just a placeholder name (Filipino for "split"). Rename it in `mobile/app.json`.

## Run the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py test expenses     # 10 tests: splitting, sync, permissions
python manage.py createsuperuser   # optional, for /admin
python manage.py runserver 0.0.0.0:8000
```

`0.0.0.0` matters: it lets your phone reach Django over Wi-Fi. If the phone can't connect, allow port 8000 through the Windows firewall.

## Run the app

```bash
cd mobile
npm install
cp .env.example .env     # then set your PC's LAN IP, e.g. EXPO_PUBLIC_API_URL=http://192.168.1.10:8000
npx expo start
```

Scan the QR code with Expo Go. The phone and the PC must be on the same Wi-Fi. Use your LAN IP, not `localhost` (on the phone, `localhost` means the phone itself). Find it with `ipconfig` (Windows) or `ip a` (Linux).

Create an account on the sign-in screen. Sign-in needs internet once; after that everything works offline.

## How your five features map to the code

1. **Credit limit.** Each budget (`Group`) has `credit_limit_cents`. Remaining credit is always computed as limit minus the sum of expenses. It is never stored, so two phones adding expenses offline can't overwrite each other's balance.
2. **Users and invites.** `Member` rows are people inside a budget; they don't need an app account. When you add a person you can enter their Hati username. They then see an invitation on their Budgets screen, and once they accept, the budget syncs to their phone and they can add expenses too. A new budget automatically includes its creator as a person (labelled Owner), so everyone invited sees them. For older budgets the owner gets an "Add me" card, or can open their own name and tap "This is me". Anyone linked to a person sees "Your share", and every person has a screen listing what they owe for each expense.
3. **Expenses split by involvement.** Pick who was involved and how much (1×, 2×, …), or switch to **Exact amounts** and type what each person owes (it must add up to the total). Each expense also has a **due date**, today by default. ₱500 split three ways becomes ₱166.67 + ₱166.67 + ₱166.66, so the shares always add up exactly. Money is stored as whole centavos to avoid rounding errors. The split function exists twice, `backend/expenses/split.py` and `mobile/src/lib/split.ts`, and they give identical results; the server recomputes shares on every push, so it has the final say.
4. **Event schedule.** Your own events, with a date, time, and location. They are personal (only you see them) and separate from budgets and expenses.
5. **Offline + auto sync.** See below.

## How sync works

The app never talks to the server directly when you tap "Save". It writes to SQLite on the phone, marks the row `dirty`, and asks for a sync. A sync pushes dirty rows to `POST /api/sync/push/`, then pulls everything that changed since the last pull from `GET /api/sync/pull/?last_pulled_at=…`. It runs on app start, when the network comes back, when the app returns to the foreground, shortly after each edit, and every minute.

The rules that make this safe:

- **IDs are UUIDs made on the phone**, so records created offline on two phones never collide.
- **Deletes are soft** (`deleted = true`), so a delete on one phone reaches the others.
- **An expense and its split are one record** (`splits` is a JSON list), so they always sync together.
- **`local_rev`** goes up on each local edit. After a push, only rows that weren't edited again during the push are marked clean.
- **Pull never overwrites a row the phone hasn't pushed yet.**
- **Conflicts: last write wins per record.** For an expense app this is fine because expenses are mostly added, rarely edited by two people at once.
- **Pull re-sends the last 5 seconds** to cover rows that were committed while a previous pull was running. Repeats are harmless.

The protocol has the same shape WatermelonDB uses, so you can switch the phone side to WatermelonDB later without changing Django.

## Files

```
backend/
  config/settings.py        DRF + token auth
  expenses/models.py        Group, Member, Event, Expense
  expenses/split.py         the split math
  expenses/sync.py          push, pull, permissions, summary
  expenses/views.py         register, sync, summary endpoints
  expenses/tests.py
mobile/
  src/app/                  screens (Expo Router: every file is a route)
    onboarding.tsx          intro slides, shown once before the first sign-in
    (tabs)/                 floating tab bar: Home (dashboard), Expenses, Events, Profile
    login.tsx
    group/[id]/index.tsx    credit card, your share, people, a preview of expenses
    group/[id]/person/      one person's share and invite
    group/[id]/new-*.tsx    add expense / person (modals)
    new-budget.tsx, new-event.tsx   create a budget / a personal event (modals)
  src/lib/db.ts             SQLite schema + migrations
  src/lib/repo.ts           every read/write the screens use
  src/lib/sync.ts           push/pull + auto-sync triggers
  src/lib/split.ts          same math as split.py
  src/ui/                   theme + shared components
```

## API

| Method | Path | Body / query |
| --- | --- | --- |
| GET | `/api/` | public: `{status: "ok", endpoints}`, a quick "is the server up?" check (`/` redirects here) |
| POST | `/api/auth/register/` | `{username, email, password}` → `{token, username}` |
| POST | `/api/auth/login/` | `{identifier, password}` (username or email) → `{token, username}` |
| POST | `/api/auth/password/forgot/` | `{identifier}` → emails a 6-digit code (same answer either way) |
| POST | `/api/auth/password/reset/` | `{identifier, code, password}` → `{token, username}`; signs out other phones |
| GET / POST | `/api/auth/me/` | `{username, email, avatar}`; POST `{email}` adds or changes the email |
| POST / DELETE | `/api/auth/avatar/` | multipart `avatar` (JPG/PNG, under 3 MB) sets the profile photo; DELETE removes it |
| POST | `/api/auth/password/change/` | `{current_password, password}` → `{token, username}`; signs out other phones |
| POST | `/api/auth/sessions/others/` | signs out every other phone → a new `{token}` for this one |
| POST | `/api/auth/delete/` | `{password}` deletes the account (budgets it owns are deleted for everyone) |
| POST | `/api/sync/push/` | `{changes: {groups: [], members: [], events: [], expenses: []}}` |
| GET | `/api/sync/pull/` | `?last_pulled_at=<iso>` → `{changes, timestamp}` |
| GET | `/api/groups/<id>/summary/` | limit, spent, remaining, per-member usage |
| GET | `/api/users/exists/` | `?username=` → `{exists}` (checks a name before inviting) |
| GET | `/api/invitations/` | my pending invites → `[{member_id, group_name, owner_username, …}]` |
| POST | `/api/members/<id>/join/` | accept an invite, or "This is me" for the owner → `{group_id}` |
| POST | `/api/members/<id>/decline/` | decline an invite |

Pull also returns `group_ids` (every budget you can see; the phone drops local copies of the rest), `username`, and two read-only fields: `groups.owner_username` and `members.joined_username`.

Send `Authorization: Token <token>` on everything except register and login.

## Password reset emails

In development the reset email isn't sent: Django prints it, code included, in the `runserver` terminal. To send real email, set `DJANGO_EMAIL_HOST` (plus `DJANGO_EMAIL_PORT`, `DJANGO_EMAIL_HOST_USER`, `DJANGO_EMAIL_HOST_PASSWORD`, `DJANGO_EMAIL_USE_TLS`, `DJANGO_DEFAULT_FROM_EMAIL`) on the server. Accounts made before emails existed can add one in Profile.

## Profile photos

Photos are saved in `backend/media/avatars/` and served by Django at `/media/` in development only. In production, serve `MEDIA_ROOT` from your web server or object storage.

## Deploying

Set `DJANGO_DEBUG=0`, `DJANGO_SECRET_KEY`, and `DJANGO_ALLOWED_HOSTS=yourdomain.com` on the server (PythonAnywhere, Railway, a VPS, etc.), then point `EXPO_PUBLIC_API_URL` at the `https://` address. Use HTTPS for real builds; Android blocks plain `http` in release builds by default.

To use SQL Server instead of SQLite, install `mssql-django` and change `DATABASES` in `settings.py`. Nothing else needs to change.

## Good next steps

- Mark shares as paid, so "Your share" can show what's still unpaid.
- Event reminders with `expo-notifications` (schedule one when an event is saved).
- An edit-expense screen (`repo.ts` already has an `update()` helper that marks rows for sync).
