# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Hati: shared expenses against a credit limit. A Django + DRF backend (`backend/`) and an offline-first Expo app (`mobile/`, SDK 57, Expo Router, expo-sqlite). It stays on SDK 57 because store builds of Expo Go don't support SDK 58 yet (as of 2026-10-20). Don't upgrade until they do, or the app won't open in Expo Go. `README.md` has the user-facing setup, the API table and the deploy notes.

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

Styling: NativeWind v4.2.7 (Tailwind CSS 3) `className` everywhere, no `StyleSheet`. The UI kit is **React Native Reusables** (shadcn for React Native; `components.json`, components in `src/components/ui/`, `cn` in `src/lib/utils.ts`, `PortalHost` + `ThemeProvider` in `src/app/_layout.tsx`). Theme colors are shadcn CSS variables in `global.css` filled with Hati's palette, mapped in `tailwind.config.js` alongside Hati's extra colors; `src/lib/theme.ts` (Reusables' JS copy, for the navigation theme) and `src/ui/theme.ts` (hex, for icons) repeat them, so change all of them together. Screens use the primitives in `src/ui/components.tsx`, which wrap Reusables components and fix sizes for accessibility. Confirmations, notices and single-value questions use `await confirm({...})` / `notify()` / `await prompt({...})` from `src/ui/dialog.tsx` (Reusables AlertDialog, rendered by `<DialogHost />` in the root layout), never `Alert.alert`. The overlay in `src/components/ui/alert-dialog.tsx` is edited to pad itself by the keyboard height, so a `prompt()` stays above the keyboard; keep that if you regenerate the component. Deleting is swipe-left via `src/ui/SwipeToDelete.tsx` (needs the `GestureHandlerRootView` in the root layout), never long-press. Add a Reusables component with `npx @react-native-reusables/cli@latest add <name>` and check with `npx @react-native-reusables/cli@latest doctor`. **Keyboard:** Android draws edge to edge, so the keyboard covers the screen instead of resizing it. `<Screen>` handles that: on Android it adds the keyboard's height under its content and scrolls the focused input above the keyboard (inputs call `useRevealOnFocus()` on focus; `Field`, `PasswordField` and `CodeInput` already do, so a new raw `TextInput` should too). iOS uses the ScrollView's `automaticallyAdjustKeyboardInsets`. Dialogs lift themselves (`alert-dialog.tsx`). `inlineRem: 16` makes `p-4` 16px. The `frontend-design` skill has the design rules. After changing the Tailwind, Babel or Metro config, restart with `npx expo start -c`.

There are no mobile tests. Run typecheck and lint before calling mobile work done.

## Mobile rules (Expo)

@mobile/AGENTS.md

## Architecture: offline-first sync

The phone's SQLite database is the source of truth for the UI. Screens never call the API directly.

- **Writes:** screens call helpers in `mobile/src/lib/repo.ts`. Its `insert` and `update` write to SQLite, set `dirty = 1` and bump `local_rev`, then call `notifyChanged()` (screens re-query) and `requestSync()` (a debounced sync).
- **Reads:** screens use `useQuery` (`mobile/src/lib/useQuery.ts`), which re-runs the query on every `notifyChanged()`, whether it came from a local edit or from a sync.
- **Sync** (`mobile/src/lib/sync.ts`): it pushes all dirty rows to `POST /api/sync/push/`, then pulls `GET /api/sync/pull/?last_pulled_at=…`. After a push, a row is cleared only if its `local_rev` is unchanged. A pull upserts with `WHERE dirty = 0`, so it never overwrites unpushed local edits. All SQLite writes go through `serialWrite()` in `db.ts` to avoid "database is locked".
- **Server** (`backend/expenses/sync.py`): `push` applies the whole batch in one transaction. One invalid row rejects the entire push, and the phone's rows stay dirty until it's fixed. `accessible_groups()` is the permission boundary: owners plus users linked through `Member.user`. Only the owner may change a `Group`, and child rows can't be moved to another group. `pull` re-sends a 5-second overlap, and the first pull skips tombstones.

### Navigation

`src/app/(tabs)/` holds the four main screens behind a light floating tab bar (`src/ui/FloatingTabBar.tsx`, icons only, with a Reanimated pill that slides to the current tab and a raised + button in its middle that adds an expense from any tab (drawn inside a taller container, not overflowing the bar, because Android ignores taps outside a view's parent) via `src/ui/useAddExpense.ts` and `app/choose-budget.tsx`): Home (`index`, the dashboard: getting-started checklist, credit overview, `WeekChart`, budgets, upcoming events, recent expenses), Expenses, Events and Profile. With no token, the tabs layout redirects to `/onboarding` (three intro slides, shown once per phone; the flag is in SecureStore via `lib/onboarding.ts`, so sign-out doesn't reset it) or to `/login`. Tab screens have no navigation header. They use `<Screen tab>` (safe-area padding plus `TAB_BAR_SPACE` so the bar never covers content) and `<TabHeader>`. Transitions: tabs `animation: 'shift'`, pushed screens `'ios_from_right'`, creation modals `'slide_from_bottom'`, intro/sign-in/home `'fade'`; all become `'none'` when Reanimated's `useReducedMotion()` is true. Expenses and Events show every budget and take `?group=<id>` as a filter; the budget page links to them with `router.navigate({ pathname: '/expenses', params: { group: id } })`. New budgets are created in `app/new-budget.tsx` (a native `formSheet`, like `app/new-event.tsx`: both use the `sheet` options in the root layout, detents `[0.8, 1]`, `sheetCornerRadius: 20`, and no navigation header because Android sheets don't render one, so they draw `<SheetHeader>` from `src/ui/SheetHeader.tsx`; opened from Home's Budgets section, the getting-started checklist, the budget picker, and the + button when there's no budget yet). Budget, person, expense-detail (`expense/[expenseId]`, opened by tapping any `ExpenseRow`) and creation screens are stack routes in `src/app/group/[id]/` that open above the tabs. Expense rows, event cards and the budget filter live in `src/ui/rows.tsx`, so every list looks the same. **Guided tour:** `src/ui/Tour.tsx` (`<TourHost />` in the root layout) opens each step's page (`route` in `STEPS`), waits for the tab transition, then spotlights the first visible control marked with `ref={tourTarget('id')}` from the step's `targets` (Home's `new-budget`, `add` (the +), `bell`; `expenses-summary`, `new-event`, `profile-photo`; tab icons `tab-<route>` as fallbacks). Positions are measured relative to the overlay, not the window, because Android window coordinates can be off by the status bar. Home starts it once per account on each phone (`startTourIfNew(username)`, flag `hati.toured.<username>` in SecureStore via `lib/tour.ts`) and Profile → App replays it. If you rename or remove a marked control, update `STEPS`; a missing or off-screen target falls back to a centered card. **Logo:** `src/ui/Logo.tsx` (`LogoMark`, `Logo`, react-native-svg); the app icons in `mobile/assets` are drawn from the same geometry by `mobile/scripts/make-icons.py` (run it with the backend venv's Python, which has Pillow).

### Invariants that span both sides

- **Synced columns are declared twice:** `FIELDS` in `backend/expenses/sync.py` and `COLUMNS` in `mobile/src/lib/db.ts` (which also includes `id`). Adding a synced field means changing the Django model, writing a Django migration, updating `FIELDS` and `COLUMNS`, appending a new SQL migration to `MIGRATIONS` in `db.ts` (never edit one that has shipped), and updating the types in `repo.ts`. If the field isn't a plain scalar, also update `toServer`/`toLocal` in `sync.ts`.
- **Profile photos:** `Profile.avatar` (Django `ImageField`, needs Pillow). Pull sends each joined person's photo path as the read-only `members.joined_avatar` and the account's own as `avatar` (saved in meta). Changing a photo bumps `updated_at` on that account's `Member` rows, so incremental pulls carry it. The phone builds URLs with `mediaUrl()` in `src/lib/media.ts`; `<Avatar uri>` falls back to initials. Uploads go through `postForm()` in `src/lib/auth.ts` (XMLHttpRequest): since SDK 57 the global `fetch` is `expo/fetch`, which throws on React Native's `{uri, name, type}` FormData file parts, so never upload a file with `fetch`.
- **Read-only columns:** `READ_ONLY` in `sync.py` (`groups.owner_username`, `members.joined_username`) are sent on pull only. On the phone they're in `COLUMNS` and also in `PULL_ONLY` in `db.ts`, which keeps `toServer` from pushing them. `Member.user` is set only by `POST /api/members/<id>/join/` (`backend/expenses/invites.py`), with one exception: the budget's **owner** pushing a person whose `invite_username` is their own username is linked right away (`_link_owner_to_self` in `sync.py`). That's how `createGroup(name, limit, me)` adds the creator to every new budget, offline. On the phone, `isMemberMe()` in `repo.ts` treats that not-yet-synced self as "me".
- **Invites and access:** a pending `invite_username` grants no access. Joining bumps that `Member` row's `updated_at`, and `pull` then sends every row of that group, even though they're older than `last_pulled_at`. Pull also returns `group_ids`, and the phone deletes its local copy (`dirty = 0` rows only) of any group not listed. That's how a removed person loses a budget. It only clears the cache and isn't a synced delete.
- **Table order is parent-before-child** (groups → members → events → expenses) in both `TABLES` definitions. Push depends on it, because a group created offline must be saved before its members.
- **IDs are UUIDs generated on the phone** (`expo-crypto` `randomUUID`). Every synced model extends `SyncModel` (UUID pk, server-stamped `updated_at`, `deleted`).
- **Deletes are always soft:** set `deleted = 1` and never `DELETE` a synced row, or other phones never hear about it. The only exceptions clear this phone's cache: `resetLocalData()` on sign-out, and the `group_ids` pruning in `pull`.
- **Money is integer cents** (`*_cents`). Remaining credit is never stored. It is always computed as `credit_limit_cents` minus the sum of non-deleted expenses, both in `group_summary()` and in `listGroups()` on the phone.
- **The split math exists twice and must give identical results:** `backend/expenses/split.py` and `mobile/src/lib/split.ts`. The server ignores client-sent `amount_cents` in `splits` and recomputes the shares from the weights on every push, **except** for exact amounts: when every split has `"fixed": true` the typed amounts are kept, but they must add up to the expense's `amount_cents` (mixing fixed and weighted splits is rejected). The New expense form only lets you save exact amounts that add up, because a rejected push blocks the whole sync batch. Expenses also have an optional `due_at` (when shares should be paid; the form defaults it to today).
- **An expense's split lives inside the expense** as the JSON `splits` list (`[{member_id, weight, amount_cents}]`), not in a separate table, so an expense and its split always sync together. SQLite stores it as TEXT.
- **Events are personal and separate from budgets and expenses.** New events have `group_id` NULL and `Event.owner` set to whoever pushed them; only the owner pulls or changes them (`pull` adds `Q(group__isnull=True, owner=user)`; `_apply` checks the owner). Older events may still have a `group_id` and stay shared with that budget. The phone's `group_ids` pruning skips `group_id IS NULL` rows. `expenses.event_id` still exists and syncs (older expenses may have one), but the app always saves `null` and never shows it. New events are created in `app/new-event.tsx` (no budget needed).
- **The credit limit is one shared pool per `Group`.** Members have no individual limit; `group_summary()` reports each member's `used_cents`.

## Auth

DRF token auth. Account logic lives in `backend/expenses/accounts.py`: sign-up needs a username, a unique email and a password that passes Django's validators; sign-in takes a username **or** email; register/login/reset all return `{token, username}`. Forgot password emails a 6-digit code (hashed in `PasswordResetCode`, 15 min, 5 tries, one per minute, newest only; the forgot endpoint answers the same whether or not the account exists); resetting deletes the user's other tokens. Mail goes through Django 6.1 `MAILERS`: the console backend in development (the code is printed in the runserver terminal), SMTP when `DJANGO_EMAIL_HOST` is set. `GET/POST /api/auth/me/` reads or sets the email (older accounts have none). Every other endpoint requires `Authorization: Token <token>`. On the phone, `src/lib/auth.ts` wraps these calls and `src/ui/auth.tsx` has the auth screen pieces (`AuthScreen`, `PasswordField`, `PasswordRules`, `CodeInput`); screens: `login`, `signup`, `forgot-password`, `reset-password`. On the phone the token is kept in `expo-secure-store` (`mobile/src/lib/api.ts`). A 401 during sync puts the sync state into `signed-out`.

## Configuration

`backend/config/settings.py` reads `DJANGO_DEBUG` (default `1`), `DJANGO_SECRET_KEY` and `DJANGO_ALLOWED_HOSTS`. With DEBUG on, `ALLOWED_HOSTS` is `*`. The database is SQLite (`backend/db.sqlite3`). The app's API URL is `EXPO_PUBLIC_API_URL` in `mobile/.env`.
