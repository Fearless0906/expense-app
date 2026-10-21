---
name: mobile-screen
description: How to build or change a screen or front-end feature in the Hati Expo app (mobile/src/app, Expo Router + local SQLite). Use when adding a new screen, form, modal, list, or edit flow, wiring a screen to data, or adding navigation, for example "add an edit-expense screen" or "add a settings page".
---

# Building a screen in the Hati app

Screens are thin. They read local SQLite through `useQuery`, write through `repo.ts`, and render with the primitives in `ui/components.tsx`. They never talk to the server. For visual decisions, also follow the `frontend-design` skill.

## 1. Data first

- **Reads:** add a query function to `mobile/src/lib/repo.ts` that filters `deleted = 0`, then call it in the screen with `useQuery(() => getThing(id), [id])`. `undefined` means loading and `null` means not found. The hook re-runs by itself after any local write or sync.
- **Writes:** add a helper to `repo.ts` built on its `insert(table, row)` / `update(table, id, fields)`. Those mark the row `dirty`, bump `local_rev`, refresh the screens and schedule a sync. Never call `db.runAsync` or `api()` from a screen.
- **New IDs** come from `randomUUID()` (`expo-crypto`) inside `repo.ts`.
- **Delete** means `update(table, id, { deleted: 1 })`. Never use SQL `DELETE`.
- **Money:** parse with `toCents()`, store integer cents, and show with `<Money>` / `peso()`.
- **Expense splits:** compute shares with `splitAmount()` from `lib/split.ts`, and store `splits` as `[{member_id, weight, amount_cents}]`. The server recomputes them on push.
- **A new column or table** is a sync-contract change. Follow "Invariants that span both sides" in the root `CLAUDE.md`: it touches Django, `sync.py`, `db.ts` migrations and `repo.ts` types.

## 2. Route

- Every file in `mobile/src/app/` is a route. Put helpers and components outside it, in `src/ui/` or `src/lib/`.
- **Tab screen or stack screen?** The four main screens live in `app/(tabs)/` (Home dashboard, Expenses, Events, Profile) behind the floating tab bar. A new tab needs a `Tabs.Screen` in `app/(tabs)/_layout.tsx` and an icon in `ICONS` in `ui/FloatingTabBar.tsx`. Keep it to 4–5 tabs. Tab screens render `<Screen tab>` and `<TabHeader title=… action={<RoundButton …/>} />`, because they have no navigation header. Everything else is a stack screen, which opens above the tabs and has a header.
- Register stack screens in `app/_layout.tsx` with a `Stack.Screen` for their title and presentation. Creation and edit flows use `presentation: 'modal'`.
- For lists of expenses or events, reuse `ExpenseRow`, `EventCard`, `BudgetFilter` and `peopleFrom()` from `ui/rows.tsx` rather than building new rows.
- To open a tab filtered to one budget from a stack screen, use `router.navigate({ pathname: '/expenses', params: { group: id } })`.
- Use a dynamic title when it depends on data: `<Stack.Screen options={{ title: group.name }} />` inside the screen.
- Navigate with `router.push('/group/${id}/x')`, or with `{ pathname: '/group/[id]/x', params: { id, ... } }` when there are extra params. Read params with `useLocalSearchParams<{ id: string }>()`. Close a modal after saving with `router.back()`.

## 3. Screen skeleton

```tsx
export default function ThingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const thing = useQuery(() => getThing(id), [id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (thing === undefined) return <Loading />;
  if (thing === null) return <Screen><EmptyState icon="trash-outline" title="This was deleted" /></Screen>;

  async function save() {
    if (busy) return;
    // validate → setError('What to type instead.') and return
    setBusy(true);
    try {
      await updateThing(id, { ... });
      router.back();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <SyncBanner />
      <Card>
        <Field label="Name" value={...} onChangeText={...} />
      </Card>
      <ErrorText>{error}</ErrorText>
      <Button title="Save" icon="checkmark" onPress={save} busy={busy} />
    </Screen>
  );
}
```

Look at `app/group/[id]/new-expense.tsx` for a full form, with person picking, weights and a linked event, and at `app/group/[id]/index.tsx` for a list or dashboard screen.

## 4. Rules

- Style with NativeWind `className` using the shadcn role classes (`bg-card`, `text-muted-foreground`, …) and Hati extras from `tailwind.config.js`, and build screens from the primitives in `ui/components.tsx` (made from React Native Reusables in `components/ui/`). Import `Text` from `@/components/ui/text`. Use `style` only for runtime values (person colors, flex ratios, `fontVariant`). Don't use `StyleSheet` or hex values. Don't hand-edit `components/ui/` beyond small fixes; add components with `npx @react-native-reusables/cli@latest add <name>` (it still asks questions even with `--yes`).
- Person colors come from `personColorMap(members)` in `ui/theme.ts`, which needs `seq` from `listMembers`.
- Use `@/` imports (`@/lib/repo`, `@/ui/components`).
- Expo APIs change between SDKs. Before using any Expo or React Native API you aren't sure of, check the docs for the installed SDK (`expo` in `package.json`, currently 57): `https://docs.expo.dev/versions/v57.0.0/`.
- Add packages only with `npx expo install <pkg>`, and only ones that work in Expo Go. A native module that Expo Go doesn't include breaks the app for the user.

## 5. Verify

Run these from `mobile/`:

```bash
npx tsc --noEmit
npx expo export --platform android --output-dir <scratchpad>/export-test   # catches bundling and import errors
```

If you touched `repo.ts` data shapes or synced fields, also run `python manage.py test expenses` in `backend/` with the venv. Then tell the user what to tap in Expo Go to see the change.
