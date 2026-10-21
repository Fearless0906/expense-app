---
name: frontend-design
description: Senior product-design standard for the Hati mobile app (Expo / React Native + NativeWind in mobile/). Use when designing or restyling any screen, component, layout, empty/error/offline state, or UI copy, when choosing colors, type sizes, spacing, or icons, or when the user asks for the app to look better, more polished, or more professional.
---

# Frontend design for Hati

Design like a senior product designer who also ships React Native. Every screen should look like one product: calm, legible, money-first. Build polish out of the existing system, not new decoration.

## Who it's for and what matters

People manage a shared budget for an activity, such as an office party with a ₱10,000 credit limit. They open the app to answer three questions, in this order:
1. **How much credit is left?**
2. **Who used what?**
3. **What's coming up?**

Each screen leads with the answer to its main question, shown big. On the budget screen that's the dark hero card. Everything else comes after it, quieter. The app is often used offline and in a hurry, so a common action must never take more than one obvious tap.

## The look

Sage paper background (`bg`) and white rounded surfaces (`rounded-card`, 24px), with no borders or shadows on cards. A single deep-forest accent (`ink`) is used for the hero card, primary buttons and selected states. People are colored avatars with initials. Icons come from Ionicons (`@expo/vector-icons/Ionicons`), outline style at 14–20px, colored with tokens from `theme.ts`. Navigation is a **light floating tab bar** (`ui/FloatingTabBar.tsx`: Home · Expenses · Events · Profile): a compact white rounded-full bar, centered at the bottom and only as wide as its icons (fixed 56pt slots), with a border and soft shadow above the content. Tabs are **icons only** (the user asked to remove the labels; keep each tab's name as its `accessibilityLabel`); a mint pill springs to the current tab, whose icon is filled instead of outlined (never color alone). The user rejected the earlier dark pill, then asked for floating again with smooth motion, then icons only: keep it light, icon-only and animated. A round forest-green **+** sits in the **middle of the bar** (Home · Expenses · + · Events · Profile), raised about 18pt above it with a ring in the page color so it looks set into the bar. It adds an expense from any tab (`ui/useAddExpense.ts`: no budget → Home's New budget form, one → its form, several → `app/choose-budget.tsx`). Home's header shows a **notification bell** (`ui/NotificationBell.tsx`, red count badge; opens `app/notifications.tsx`: invitations, budgets over or ≥80% of their limit, events today/tomorrow, all computed live in `ui/useNotifications.ts`) and the user's **avatar** (opens Profile), not a + button. Motion: tabs shift, pushes slide from the right, forms rise from the bottom, all off under Reduce Motion (`useReducedMotion`). First launch shows a three-slide intro (`app/onboarding.tsx`) whose art is built from real components, not images; keep it that way so it stays on-brand. Charts follow the dataviz skill: see `ui/WeekChart.tsx` (one series, one color, no fading, tap to read a value, every bar labeled). The current tab expands into a white pill with its label. Tab screens open with a big `TabHeader` title and a round `+` action; stack screens use the iOS large titles from `_layout.tsx`. Keep generous spacing and one primary button per screen.

## The system (use it, extend it, never bypass it)

Style with **NativeWind `className`**. The UI kit is **React Native Reusables** (shadcn for React Native): its components live in `mobile/src/components/ui/`, and Hati's building blocks in `mobile/src/ui/components.tsx` are made from them. Theme colors are shadcn CSS variables in `mobile/global.css` (filled with Hati's palette), mapped in `mobile/tailwind.config.js`; `mobile/src/ui/theme.ts` repeats them as hex for icons and navigation options. Read these before designing anything.

- **Color classes (shadcn roles):** `bg-background` (sage page), `bg-card` (white surfaces), `bg-muted` (inputs, icon wells), `text-foreground` / `bg-primary` (deep forest: text, primary button, hero card), `text-muted-foreground`, `border-border`, `text-destructive` / `bg-over-soft` (over the limit, errors), `bg-accent`. Hati extras: `text-remaining` / `bg-remaining-soft` (credit left, links, the chart), `bg-track`, and on the dark hero card `text-on-ink`, `text-on-ink-muted`, `text-on-ink-good`, `text-on-ink-over`, `bg-hero-track`. Never use Tailwind's default palette (`text-blue-500`), arbitrary colors (`bg-[#123]`) or hex values in screens. A new color goes into `global.css` (shadcn role) or `tailwind.config.js` (Hati extra) and `theme.ts`.
- **Person colors:** `personColorMap(members)` in `theme.ts` assigns colors in the order people were added (`Member.seq`). These colors are bright: use them as avatar fills (with `text-ink` initials) and as segments on the dark hero gauge. Never use them as text, or as the only signal on a light surface.
- **Spacing:** use the Tailwind scale. `inlineRem: 16` makes `p-4` 16px. Screen padding is `px-4`, the gap between blocks `gap-4`, card padding `p-5`, and gaps inside a card `gap-3`.
- **Radius:** `rounded-3xl` (24) for cards and the hero, `rounded-lg` (14, `--radius`) for inputs, buttons and tiles, `rounded-full` for pills, chips and avatars.
- **Type scale:** `text-4xl font-extrabold tracking-tight` for the hero amount, `text-2xl font-extrabold` for secondary amounts and the date numeral, `text-lg font-bold tracking-tight` for section titles, `text-base font-semibold` for item titles, buttons and money, `text-sm` for body and muted text, and `text-xs` for captions and pills. Don't invent sizes.
- **Primitives** (`ui/components.tsx`, built on Reusables): `Screen`, `TabHeader`, `RoundButton`, `Card`, `ListCard` + `Row`, `SectionTitle`, `Muted`, `Button` (primary / secondary / ghost / danger, `icon`, `busy`; always 48pt), `TextLink`, `Field` (Label + Input, grows with text size), `ErrorText` and `SyncBanner` (Alert), `Money`, `Pill` (Badge), `Avatar`, `IconWell`, `EmptyState`, `CreditGauge`, `Loading`, and `cx()` (= `cn`, tailwind-merge). Use Reusables `Text` (`@/components/ui/text`), not React Native's. Prefer these primitives; reach for a raw Reusables component (Tabs, Progress, Separator…) only when no primitive fits. Need a new one? `npx @react-native-reusables/cli@latest add <name>` in `mobile/`, then wrap it here if it'll be reused.
- **Avatars:** always pass `uri` when a photo exists (`people.avatarOf(memberId)` or `mediaUrl(member.joined_avatar)`); initials are the fallback. **Settings lists** (Profile) use grouped `ListCard`s with an icon well, label, one-line detail and a chevron; destructive rows are red and always confirm.
- **`style` is only for runtime values:** person colors, gauge flex ratios, avatar sizes, and `fontVariant: ['tabular-nums']` (NativeWind can't map `tabular-nums`). Don't use `StyleSheet`.
- **Class conflicts:** `cn()` resolves them (a passed `text-xs` beats a primitive's `text-sm`), so overriding is fine. Always write whole class names (`cx(on && 'bg-primary')`, not `` `bg-${x}` ``) so Tailwind can find them. Reusables defaults that break Hati's rules are overridden in the primitives: 40px buttons → 48pt, fixed `h-10` inputs → `h-auto min-h-12`, faint placeholder → `placeholder:text-placeholder` (4.6:1).
- **Light mode only** (`userInterfaceStyle: "light"` in `app.json`). Don't add dark mode unless asked. If you do, it means theming every token, not just a few screens.

## Money and numbers

- Format money with `peso()` or `<Money>`, never by hand. Amounts are integer centavos. Parse input with `toCents()`.
- Numbers that line up or update need tabular figures, which `Money` and `Pill` already apply.
- Show the sign in words, not only in color: "Over the credit limit by ₱1,200.00", not a red "−₱1,200.00".
- Dates use `formatDay` and `formatTime` from `lib/money.ts` (en-PH locale).

## Every screen needs all its states

Design each of these before calling a screen done:

| State | Pattern |
| --- | --- |
| Loading | `<Loading />` while `useQuery` returns `undefined` |
| Not found / deleted | `useQuery` returns `null` → `<EmptyState icon="trash-outline" title="This … was deleted" />` |
| Empty | `<EmptyState>` with an icon, a title, and a sentence saying how to add the first one |
| Offline / sync error | `<SyncBanner />` at the top of any screen that shows synced data. Never block input while offline: saving always works locally. |
| Validation error | `<ErrorText>` (an alert role with a live region), saying what to type ("Enter an amount like 10000 or 10,000.50.") |
| Over limit | The `over` colors, a change of words ("Over by"), and the gauge's over border |
| Busy | `Button busy` plus an early return in the save handler, so a double tap can't save twice |
| Destructive | `await confirm({ title, message, confirmLabel: 'Delete', destructive: true })` from `ui/dialog.tsx` (shadcn AlertDialog), with the consequence in the message. Never React Native's `Alert.alert`; use `notify(title, message)` for a one-button notice, and `await prompt({ title, label, initial, keyboardType, validate })` to ask for one value in a dialog (e.g. the credit limit) instead of an inline edit card |

## Copy voice

Plain, short, sentence case, with no exclamation marks. Say what happens, not what the system is doing: "₱500.00 goes back to the credit limit." Name things the way users do: "budget", "people", "expense", "event", "credit left". Never say "group", "member", "sync conflict" or "record". When a gesture is hidden (swipe to delete), add a `Muted` hint line under the list.

## Touch, layout and platform

- Touch targets are at least 44×44 pt. `Button` is a **fixed** `h-12` (48pt; `h-11` for ghost/danger) with `py-0`, so it never grows taller. Any text inside a button-like control uses `<ButtonLabel>` from `ui/components.tsx` (one line, `leading-5`, and on Android no font padding + vertical centering), never a plain `Text`, or the label sits low on Android. Small controls get `hitSlop` to reach 44.
- Feedback when pressed: `active:opacity-80` on cards, `active:opacity-60/70` on small controls, `active:bg-muted` on list rows.
- One primary button per screen. The rest are `secondary`, `ghost` or a `TextLink`.
- Forms: fields in reading order, `keyboardType="decimal-pad"` for money, `returnKeyType` plus `onSubmitEditing` to move along, and the right `autoComplete` / `textContentType`. `Screen` already handles keyboard insets and taps while the keyboard is open.
- Creation flows open as modals (`presentation: 'modal'` in `app/_layout.tsx`) and close with `router.back()` after saving.

## Accessibility (measured against the current palette)

- Text contrast passes WCAG AA: `ink` 12.6:1 on `bg`, `muted-foreground` 4.7:1 on `background` and 4.9:1 on `muted`, `remaining` 5.3:1 on white, `placeholder` 4.6:1 on `sunken`, and the on-ink colors 7.3–8.8:1 on `ink`. Don't put `muted-foreground` or `remaining` text on anything darker than `background`, and don't fade text with opacity. To mark something as past or inactive, use labels or a different section.
- Every `Pressable` has an `accessibilityRole`: `button`, `checkbox`, `radio` or `tab`, plus state (`checked`, `selected`, `disabled`, `expanded`). Add `accessibilityLabel` when the visible text doesn't explain it, and `accessibilityHint` for anything that isn't obvious.
- **Deleting is swipe-left, never long-press** (the user asked for this): wrap the row in `<SwipeToDelete onDelete label>` from `ui/SwipeToDelete.tsx` (Gesture Handler `ReanimatedSwipeable`; a red trash button grows in with the swipe, tap → `confirm()` dialog) and in `Reanimated.View` with `exiting={FadeOut}` + `layout={LinearTransition}` so the list closes up smoothly. Every swipe action is also an `accessibilityActions` entry (`deleteAction` / `onDelete` in `ui/rows.tsx`), because screen readers can't swipe. People chips don't swipe: removing a person is the button on their screen.
- `Avatar` is hidden from screen readers. The person's name must be readable next to it, or in the parent's label.
- Status that changes on screen (the sync banner, errors, the "left after this" pill) uses `accessibilityLiveRegion="polite"`.
- Support larger system font sizes. Don't fix the height of anything that contains text (`min-h-*`, not `h-*`), and let titles shrink and wrap (`flex-shrink`).

## Expo Go constraint

The app must keep running in **Expo Go (SDK 57)**. Only use libraries that ship in Expo Go, added with `npx expo install`. Reanimated 4 is installed. Keep animations under 250 ms, use them only to explain changes (an item appearing, the gauge moving), and skip them when `AccessibilityInfo.isReduceMotionEnabled()` is true.

## Before you say it's done

1. Run `npx tsc --noEmit` in `mobile/`.
2. Compare the screen with the states table above.
3. Run `grep -rnE "StyleSheet|#[0-9A-Fa-f]{3,6}" src/app src/ui/components.tsx`. It should print nothing.
4. Run `npx expo export --platform android --clear --output-dir <scratchpad>`, which catches Babel/NativeWind errors.
5. Describe what the user will see on the phone, and ask them to check it in Expo Go, because you can't see the screen.
