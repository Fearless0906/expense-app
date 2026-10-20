# Hati — shared expenses against a credit limit

Django + DRF backend, Expo app (SDK 58, Expo Router, SQLite). The app works fully offline and syncs when it's back online.

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
2. **Users.** `Member` rows are people inside a budget; they don't need an app account. If you link `Member.user` to an account (in `/admin` for now), that person can sync the same budget on their own phone.
3. **Expenses split by involvement.** Pick who was involved and how much (1×, 2×, …). ₱500 split three ways becomes ₱166.67 + ₱166.67 + ₱166.66, so the shares always add up exactly. Money is stored as whole centavos to avoid rounding errors. The split function exists twice, `backend/expenses/split.py` and `mobile/src/lib/split.ts`, and they give identical results; the server recomputes shares on every push, so it has the final say.
4. **Event schedule.** Events have a date, time, and location. Expenses can be linked to an event; tapping an event opens "Add expense" already linked to it.
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
    index.tsx               budgets list + create budget
    login.tsx
    group/[id]/index.tsx    credit gauge, people, events, expenses
    group/[id]/new-expense.tsx
    group/[id]/new-event.tsx
  src/lib/db.ts             SQLite schema + migrations
  src/lib/repo.ts           every read/write the screens use
  src/lib/sync.ts           push/pull + auto-sync triggers
  src/lib/split.ts          same math as split.py
  src/ui/                   theme + shared components
```

## API

| Method | Path | Body / query |
| --- | --- | --- |
| POST | `/api/auth/register/` | `{username, password}` → `{token}` |
| POST | `/api/auth/login/` | `{username, password}` → `{token}` |
| POST | `/api/sync/push/` | `{changes: {groups: [], members: [], events: [], expenses: []}}` |
| GET | `/api/sync/pull/` | `?last_pulled_at=<iso>` → `{changes, timestamp}` |
| GET | `/api/groups/<id>/summary/` | limit, spent, remaining, per-member usage |

Send `Authorization: Token <token>` on everything except register and login.

## Deploying

Set `DJANGO_DEBUG=0`, `DJANGO_SECRET_KEY`, and `DJANGO_ALLOWED_HOSTS=yourdomain.com` on the server (PythonAnywhere, Railway, a VPS, etc.), then point `EXPO_PUBLIC_API_URL` at the `https://` address. Use HTTPS for real builds; Android blocks plain `http` in release builds by default.

To use SQL Server instead of SQLite, install `mssql-django` and change `DATABASES` in `settings.py`. Nothing else needs to change.

## Good next steps

- Invite people from the app by username (sets `Member.user`), instead of through `/admin`.
- Event reminders with `expo-notifications` (schedule one when an event is saved).
- An edit-expense screen (`repo.ts` already has an `update()` helper that marks rows for sync).
