# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Hati: shared expenses against a credit limit. A Django + DRF backend (`backend/`) and an offline-first Expo app (`mobile/`, SDK 58, Expo Router, expo-sqlite). `README.md` has the user-facing setup, the API table and the deploy notes.

## Commands

Backend (run from `backend/`, venv at `backend/.venv`; on Windows activate with `.venv\Scripts\activate`):

```bash
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8000      # 0.0.0.0 so a phone on the same Wi-Fi can reach it
python manage.py test expenses               # all tests
python manage.py test expenses.tests.SyncTests.test_bad_push_saves_nothing   # one test
python manage.py makemigrations expenses     # after any model change
```

Mobile (run from `mobile/`):

```bash
npm install
cp .env.example .env     # set EXPO_PUBLIC_API_URL to the PC's LAN IP, never localhost
npx expo start           # scan the QR code with Expo Go
npx tsc --noEmit         # typecheck (also: npm run typecheck)
npx expo lint            # lint (no ESLint config yet; the first run sets it up)
npx expo install <pkg>   # always use this to add packages, not npm install <pkg>
```

There are no mobile tests. Run typecheck and lint before calling mobile work done.

## Mobile rules (Expo)

@mobile/AGENTS.md

## Architecture: offline-first sync

The phone's SQLite database is the source of truth for the UI. Screens never call the API directly.

- **Writes:** screens call helpers in `mobile/src/lib/repo.ts`. Its `insert` and `update` write to SQLite, set `dirty = 1` and bump `local_rev`, then call `notifyChanged()` (screens re-query) and `requestSync()` (a debounced sync).
- **Reads:** screens use `useQuery` (`mobile/src/lib/useQuery.ts`), which re-runs the query on every `notifyChanged()`, whether it came from a local edit or from a sync.
- **Sync** (`mobile/src/lib/sync.ts`): it pushes all dirty rows to `POST /api/sync/push/`, then pulls `GET /api/sync/pull/?last_pulled_at=…`. After a push, a row is cleared only if its `local_rev` is unchanged. A pull upserts with `WHERE dirty = 0`, so it never overwrites unpushed local edits. All SQLite writes go through `serialWrite()` in `db.ts` to avoid "database is locked".
- **Server** (`backend/expenses/sync.py`): `push` applies the whole batch in one transaction. One invalid row rejects the entire push, and the phone's rows stay dirty until it's fixed. `accessible_groups()` is the permission boundary: owners plus users linked through `Member.user`. Only the owner may change a `Group`, and child rows can't be moved to another group. `pull` re-sends a 5-second overlap, and the first pull skips tombstones.

### Invariants that span both sides

- **Synced columns are declared twice:** `FIELDS` in `backend/expenses/sync.py` and `COLUMNS` in `mobile/src/lib/db.ts` (which also includes `id`). Adding a synced field means changing the Django model, writing a Django migration, updating `FIELDS` and `COLUMNS`, appending a new SQL migration to `MIGRATIONS` in `db.ts` (never edit one that has shipped), and updating the types in `repo.ts`. If the field isn't a plain scalar, also update `toServer`/`toLocal` in `sync.ts`.
- **Table order is parent-before-child** (groups → members → events → expenses) in both `TABLES` definitions. Push depends on it, because a group created offline must be saved before its members.
- **IDs are UUIDs generated on the phone** (`expo-crypto` `randomUUID`). Every synced model extends `SyncModel` (UUID pk, server-stamped `updated_at`, `deleted`).
- **Deletes are always soft:** set `deleted = 1` and never `DELETE` a synced row, or other phones never hear about it. The only exception is `resetLocalData()` on sign-out.
- **Money is integer cents** (`*_cents`). Remaining credit is never stored. It is always computed as `credit_limit_cents` minus the sum of non-deleted expenses, both in `group_summary()` and in `listGroups()` on the phone.
- **The split math exists twice and must give identical results:** `backend/expenses/split.py` and `mobile/src/lib/split.ts`. The server ignores client-sent `amount_cents` in `splits` and recomputes the shares from the weights on every push.
- **An expense's split lives inside the expense** as the JSON `splits` list (`[{member_id, weight, amount_cents}]`), not in a separate table, so an expense and its split always sync together. SQLite stores it as TEXT.
- **The credit limit is one shared pool per `Group`.** Members have no individual limit; `group_summary()` reports each member's `used_cents`.

## Auth

DRF token auth. `POST /api/auth/register/` and `/api/auth/login/` return `{token}`, and every other endpoint requires `Authorization: Token <token>`. On the phone the token is kept in `expo-secure-store` (`mobile/src/lib/api.ts`). A 401 during sync puts the sync state into `signed-out`.

## Configuration

`backend/config/settings.py` reads `DJANGO_DEBUG` (default `1`), `DJANGO_SECRET_KEY` and `DJANGO_ALLOWED_HOSTS`. With DEBUG on, `ALLOWED_HOSTS` is `*`. The database is SQLite (`backend/db.sqlite3`). The app's API URL is `EXPO_PUBLIC_API_URL` in `mobile/.env`.
