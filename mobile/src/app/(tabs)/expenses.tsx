import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { formatDay, peso } from '@/lib/money';
import { getMyUsername, listAllExpenses, listAllMembers, listGroups } from '@/lib/repo';
import { useQuery } from '@/lib/useQuery';
import {
  Card,
  EmptyState,
  ListCard,
  Loading,
  Money,
  Screen,
  SyncBanner,
  TabHeader,
} from '@/ui/components';
import { BudgetFilter, ExpenseRow, peopleFrom } from '@/ui/rows';
import { tourTarget } from '@/ui/Tour';

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return formatDay(iso);
}

export default function ExpensesTab() {
  // ?group=<id> filters to one budget (the budget page links here with it).
  const { group } = useLocalSearchParams<{ group?: string }>();
  const groups = useQuery(listGroups, []);
  const members = useQuery(listAllMembers, []);
  const expenses = useQuery(listAllExpenses, []);
  const me = useQuery(getMyUsername, []);

  if (!groups || !members || !expenses || me === undefined) return <Loading />;

  const filter = groups.some((g) => g.id === group) ? group! : null;
  const setFilter = (id: string | null) => router.setParams({ group: id ?? '' });
  const shown = filter ? expenses.filter((x) => x.group_id === filter) : expenses;
  const people = peopleFrom(members, me);
  const budgetName = (id: string) => groups.find((g) => g.id === id)?.name;
  const total = shown.reduce((a, x) => a + x.amount_cents, 0);
  const myTotal = shown.reduce((a, x) => a + (x.splits.find((s) => people.isMe(s.member_id))?.amount_cents ?? 0), 0);
  const linked = members.some((m) => people.isMe(m.id));
  const showBudget = !filter && groups.length > 1;

  // Newest first, split into one card per day.
  const days: { label: string; items: typeof shown }[] = [];
  for (const x of shown) {
    const label = dayLabel(x.spent_at);
    if (days.at(-1)?.label === label) days.at(-1)!.items.push(x);
    else days.push({ label, items: [x] });
  }

  return (
    <Screen tab>
      <TabHeader
        title="Expenses"
        subtitle={filter ? budgetName(filter) : groups.length > 1 ? 'All budgets' : undefined}
      />
      <SyncBanner />

      {groups.length === 0 ? (
        <EmptyState icon="wallet-outline" title="No budgets yet">
          Create a budget first, then add its expenses here.
        </EmptyState>
      ) : (
        <>
          <BudgetFilter groups={groups} value={filter} onChange={setFilter} />

          <View ref={tourTarget('expenses-summary')} collapsable={false}>
          <Card className="flex-row">
            <View className="flex-1 gap-0.5">
              <Text className="text-xs font-medium text-muted-foreground">Spent</Text>
              <Money cents={total} className="text-2xl font-extrabold tracking-tight text-foreground" />
              <Text className="text-xs text-muted-foreground">
                {shown.length} expense{shown.length === 1 ? '' : 's'}
              </Text>
            </View>
            {linked && (
              <View className="flex-1 gap-0.5 border-l border-border pl-4">
                <Text className="text-xs font-medium text-muted-foreground">Your share</Text>
                <Money cents={myTotal} className="text-2xl font-extrabold tracking-tight text-remaining" />
                <Text className="text-xs text-muted-foreground">
                  {total > 0 ? `${Math.round((myTotal / total) * 100)}% of spending` : 'Nothing yet'}
                </Text>
              </View>
            )}
          </Card>
          </View>

          {shown.length === 0 ? (
            <EmptyState icon="receipt-outline" title="No expenses yet">
              Add the first one with the + button below, like printables or snacks.
            </EmptyState>
          ) : (
            days.map((day) => (
              <View key={day.label} className="gap-2">
                <View className="flex-row items-center justify-between px-1">
                  <Text accessibilityRole="header" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {day.label}
                  </Text>
                  <Text className="text-xs font-medium text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>
                    {peso(day.items.reduce((a, x) => a + x.amount_cents, 0))}
                  </Text>
                </View>
                <ListCard>
                  {day.items.map((x, i) => (
                    <ExpenseRow
                      key={x.id}
                      expense={x}
                      first={i === 0}
                      people={people}
                      budgetName={showBudget ? budgetName(x.group_id) : undefined}
                    />
                  ))}
                </ListCard>
              </View>
            ))
          )}
          {shown.length > 0 && (
            <Text className="px-1 text-sm leading-5 text-muted-foreground">Swipe an expense left to delete it.</Text>
          )}
        </>
      )}
    </Screen>
  );
}
