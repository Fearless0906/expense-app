/** List items shared by the budget page and the Expenses / Events tabs, so they look the same everywhere. */
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { AccessibilityActionEvent, Pressable, ScrollView, View } from "react-native";
import Reanimated, { FadeOut, LinearTransition } from "react-native-reanimated";

import { Text } from "@/components/ui/text";
import { dueLabel, formatDay, formatTime, peso } from "@/lib/money";
import { mediaUrl } from "@/lib/media";
import {
  deleteEvent,
  deleteExpense,
  EventRow,
  Expense,
  Group,
  isMemberMe,
  Member,
  sameUser,
} from "@/lib/repo";

import {
  Avatar,
  Card,
  cx,
  IconWell,
  Money,
  Muted,
  Pill,
  Row,
} from "./components";
import { confirm } from "./dialog";
import { SwipeToDelete } from "./SwipeToDelete";
import { colors, personColorMap } from "./theme";

/** Screen readers can't swipe, so every swipe-to-delete row also has a "Delete" accessibility action. */
export const deleteAction = [{ name: "delete", label: "Delete" }];
export const onDelete = (run: () => void) => (e: AccessibilityActionEvent) => {
  if (e.nativeEvent.actionName === "delete") run();
};

export type People = {
  nameOf: (memberId: string) => string;
  colorOf: (memberId: string) => string;
  isMe: (memberId: string) => boolean;
  /** Profile photo URL of the account linked to this person, if any. */
  avatarOf: (memberId: string) => string | undefined;
};

/** Names and colors for people across any number of budgets. Colors are per budget. */
export function peopleFrom(members: Member[], me: string | null): People {
  const byGroup = new Map<string, Member[]>();
  for (const m of members)
    byGroup.set(m.group_id, [...(byGroup.get(m.group_id) ?? []), m]);
  const color = new Map<string, string>();
  for (const list of byGroup.values())
    for (const [k, v] of personColorMap(list)) color.set(k, v);
  const byId = new Map(members.map((m) => [m.id, m]));
  const mine = new Set(
    members
      .filter((m) => !m.deleted && isMemberMe(m, me))
      .map((m) => m.id),
  );
  return {
    nameOf: (id) => {
      const name = byId.get(id)?.name ?? "Removed person";
      return mine.has(id) ? `${name} (you)` : name;
    },
    colorOf: (id) => color.get(id) ?? colors.track,
    isMe: (id) => mine.has(id),
    avatarOf: (id) => mediaUrl(byId.get(id)?.joined_avatar),
  };
}

export async function confirmDeleteExpense(x: Expense) {
  const ok = await confirm({
    title: `Delete “${x.name}”?`,
    message: `${peso(x.amount_cents)} goes back to the credit limit.`,
    confirmLabel: "Delete",
    destructive: true,
  });
  if (ok) await deleteExpense(x.id);
}

export async function confirmDeleteEvent(e: EventRow) {
  const ok = await confirm({
    title: `Delete “${e.title}”?`,
    message: "Expenses linked to it are kept.",
    confirmLabel: "Delete",
    destructive: true,
  });
  if (ok) await deleteEvent(e.id);
}

/** One expense inside a ListCard. `budgetName` is shown on cross-budget lists. */
export function ExpenseRow({
  expense: x,
  first,
  people,
  budgetName,
  onPress,
}: {
  expense: Expense;
  first?: boolean;
  people: People;
  budgetName?: string;
  onPress?: () => void;
}) {
  // Tapping an expense opens its detail screen (callers can override).
  const open =
    onPress ??
    (() => router.push({ pathname: "/group/[id]/expense/[expenseId]", params: { id: x.group_id, expenseId: x.id } }));
  const mine = x.splits.find((s) => people.isMe(s.member_id));
  const context = [formatDay(x.spent_at), budgetName, x.due_at && dueLabel(x.due_at)]
    .filter(Boolean)
    .join(" · ");
  const split = x.splits
    .map((s) => `${people.nameOf(s.member_id)} ${peso(s.amount_cents)}`)
    .join(", ");
  return (
    <Reanimated.View exiting={FadeOut.duration(200)} layout={LinearTransition.duration(220)}>
    <SwipeToDelete onDelete={() => confirmDeleteExpense(x)} label={`Delete ${x.name}`}>
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${x.name}, ${peso(x.amount_cents)}, ${context}. Split: ${split}`}
      accessibilityHint="Opens the expense. Swipe left to delete."
      accessibilityActions={deleteAction}
      onAccessibilityAction={onDelete(() => confirmDeleteExpense(x))}
      onPress={open}
      className="bg-card active:bg-muted"
    >
      <Row first={first}>
        <View className="flex-row gap-3">
          <IconWell name="receipt-outline" />
          <View className="flex-1 gap-1">
            <View className="flex-row items-start justify-between gap-3">
              <Text className="flex-shrink text-base font-semibold text-foreground">
                {x.name}
              </Text>
              <Money cents={x.amount_cents} />
            </View>
            <Text className="text-xs text-muted-foreground">{context}</Text>
            {mine && (
              <Pill tone="good" icon="person-outline">
                Your share {peso(mine.amount_cents)}
              </Pill>
            )}
            <View className="mt-1 flex-row flex-wrap gap-x-3 gap-y-1.5">
              {x.splits.map((s) => (
                <View
                  key={s.member_id}
                  className="flex-row items-center gap-1.5"
                >
                  <Avatar
                    name={people.nameOf(s.member_id)}
                    color={people.colorOf(s.member_id)}
                    uri={people.avatarOf(s.member_id)}
                    size={18}
                  />
                  <Text
                    className="text-xs text-muted-foreground"
                    style={{ fontVariant: ["tabular-nums"] }}
                  >
                    {people.nameOf(s.member_id)} {peso(s.amount_cents)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </Row>
    </Pressable>
    </SwipeToDelete>
    </Reanimated.View>
  );
}

/** One event on the schedule. Events are separate from expenses; swipe left to delete. */
export function EventCard({
  event: e,
  isPast,
}: {
  event: EventRow;
  isPast: boolean;
}) {
  const start = new Date(e.starts_at);
  const when = `${formatDay(e.starts_at)}, ${formatTime(e.starts_at)}`;
  return (
    <Reanimated.View exiting={FadeOut.duration(200)} layout={LinearTransition.duration(220)}>
    <SwipeToDelete onDelete={() => confirmDeleteEvent(e)} label={`Delete ${e.title}`}>
    <View
      accessible
      accessibilityLabel={`${e.title}, ${when}${e.location ? `, at ${e.location}` : ""}`}
      accessibilityHint="Swipe left to delete the event."
      accessibilityActions={deleteAction}
      onAccessibilityAction={onDelete(() => confirmDeleteEvent(e))}
    >
      <Card className="flex-row items-center">
        <View
          className={cx(
            "w-14 items-center rounded-lg py-2",
            isPast ? "border border-border bg-card" : "bg-remaining-soft",
          )}
        >
          <Text
            className={cx(
              "text-xs font-semibold uppercase",
              isPast ? "text-muted-foreground" : "text-remaining",
            )}
          >
            {start.toLocaleDateString("en-PH", { month: "short" })}
          </Text>
          <Text className="text-2xl font-extrabold text-foreground">
            {start.getDate()}
          </Text>
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-base font-semibold text-foreground">{e.title}</Text>
          <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
            <View className="flex-row items-center gap-1">
              <Ionicons name="time-outline" size={14} color={colors.muted} />
              <Muted>{formatTime(e.starts_at)}</Muted>
            </View>
            {e.location ? (
              <View className="flex-shrink flex-row items-center gap-1">
                <Ionicons
                  name="location-outline"
                  size={14}
                  color={colors.muted}
                />
                <Muted className="flex-shrink">{e.location}</Muted>
              </View>
            ) : null}
          </View>
        </View>
      </Card>
    </View>
    </SwipeToDelete>
    </Reanimated.View>
  );
}

/** "All" plus one chip per budget, scrolling sideways. `value` null means all budgets. */
export function BudgetFilter({
  groups,
  value,
  onChange,
}: {
  groups: Group[];
  value: string | null;
  onChange: (groupId: string | null) => void;
}) {
  if (groups.length < 2) return null;
  const options = [
    { id: null as string | null, name: "All budgets" },
    ...groups,
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      className="-mx-4 flex-grow-0"
      contentContainerClassName="gap-2 px-4"
    >
      {options.map((g) => {
        const on = value === g.id;
        return (
          <Pressable
            key={g.id ?? "all"}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(g.id)}
            className={cx(
              "min-h-11 flex-row items-center gap-1.5 rounded-full px-4 active:opacity-70",
              on ? "bg-primary" : "bg-card",
            )}
          >
            {on && <Ionicons name="checkmark" size={14} color={colors.onInk} />}
            <Text
              className={cx(
                "text-sm font-medium",
                on ? "text-on-ink" : "text-foreground",
              )}
            >
              {g.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
