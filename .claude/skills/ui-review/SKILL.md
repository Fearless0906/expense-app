---
name: ui-review
description: Senior design and front-end review of Hati app screens (mobile/src/app, mobile/src/ui). Use when the user asks to review, critique, audit, or polish the UI or UX, check accessibility, or "make the frontend better" before choosing what to change; also run it on your own screen changes before calling front-end work done.
---

# UI review for the Hati app

Review the way a senior product designer and a senior React Native engineer would together. Find what actually hurts users, ranked, with a concrete fix for each problem. The standard to measure against is the `frontend-design` skill; read it first.

## How to review

1. **Scope.** Take the screens the user named, or the changed files. For "the whole app", that's every file in `mobile/src/app/` plus `mobile/src/ui/`.
2. **Read the code. Don't guess at the pixels.** You can't see the phone, so reason from styles, tokens and layout. When something depends on rendering, like truncation, wrapping or a large font size, say so and ask the user to check it in Expo Go.
3. **Walk each screen through the user's main question:** credit left → who used what → what's next. Is the answer the most prominent thing on the screen?
4. **Check every state:** loading, deleted/not found, empty, offline / sync error, validation error, over limit, busy, destructive confirm. A missing state is a finding.
5. **Check the system:**
   - `StyleSheet`, hex colors, Tailwind default palette or arbitrary values instead of the shadcn role classes / Hati extras, or React Native's `Text` instead of Reusables `Text`
   - classes that conflict with a primitive's own classes
   - one-off components that duplicate a primitive
   - type sizes off the scale
   - more than one primary button
6. **Check accessibility:**
   - a `Pressable` without `accessibilityRole` or label
   - swipe-only or long-press actions with no hint and no accessibility action
   - color as the only signal
   - fixed heights that clip large text
   - targets under 44 pt
7. **Check the copy:** jargon ("group", "member", "sync"), vague errors, title case, exclamation marks, or an error that doesn't say what to do.
8. **Check behavior:**
   - a double tap that can save twice (no `busy`)
   - the keyboard covering the save button
   - work lost when the modal is dismissed
   - a screen that writes without going through `repo.ts`
   - React Native's `Alert.alert` instead of `confirm()` / `notify()` from `ui/dialog.tsx`

## Known weak spots in the current code (verify; they may be fixed)

- Expenses have a detail screen (`app/group/[id]/expense/[expenseId].tsx`, with a visible Delete) but still can't be **edited**: a mistake means deleting and adding it again.

- There's no event detail screen. Event notes are saved but never shown, and tapping an event goes straight to "Add expense".
- Dismissing the add-expense or add-event modal throws away what was typed without asking.
- Events and expenses are drawn with `.map()` in a `ScrollView`, which will get slow with hundreds of rows.
- The tiny 18px avatars in expense rows show initials that are hard to read. They work as color dots, with the name next to them.

## Report format

Start with a one-line verdict. Then list the findings, most severe first:

```
1. [Blocker|Major|Minor|Polish] Screen / component — file:line
   Problem: what the user experiences.
   Fix: the specific change (token, component, copy, prop).
```

Severity:
- **Blocker:** the user can't complete a task, or loses data or money.
- **Major:** the task is hard, misleading, or inaccessible.
- **Minor:** inconsistent, or the polish is clearly off.
- **Polish:** nice to have.

End with the 3 changes that would improve the app most, and offer to make them. Don't edit files during a review unless the user asked for fixes.
