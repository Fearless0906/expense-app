import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { dueLabel, formatDay, formatTime, peso } from '@/lib/money';
import { deleteExpense, getExpense, getGroup, getMyUsername, listMembers } from '@/lib/repo';
import { useQuery } from '@/lib/useQuery';
import {
  Avatar,
  Button,
  cx,
  EmptyState,
  IconName,
  IconWell,
  ListCard,
  Loading,
  Money,
  Pill,
  Row,
  Screen,
  SectionTitle,
} from '@/ui/components';
import { confirm } from '@/ui/dialog';
import { peopleFrom } from '@/ui/rows';
import { colors } from '@/ui/theme';

/** One expense: amount, dates, where it belongs, and who owes what. */
export default function ExpenseDetail() {
  const { id, expenseId } = useLocalSearchParams<{ id: string; expenseId: string }>();
  const expense = useQuery(() => getExpense(expenseId), [expenseId]);
  const group = useQuery(() => getGroup(id), [id]);
  const members = useQuery(() => listMembers(id), [id]);
  const me = useQuery(getMyUsername, []);

  if (expense === undefined || group === undefined || !members || me === undefined) return <Loading />;
  if (expense === null || group === null) {
    return (
      <Screen>
        <Stack.Screen options={{ title: '' }} />
        <EmptyState icon="trash-outline" title="This expense was deleted">
          It was removed, maybe on another phone.
        </EmptyState>
      </Screen>
    );
  }

  const x = expense;
  const people = peopleFrom(members, me);
  const exact = x.splits.length > 0 && x.splits.every((s) => s.fixed);
  const mine = x.splits.find((s) => people.isMe(s.member_id));
  const pct = (cents: number) => (x.amount_cents > 0 ? Math.round((cents / x.amount_cents) * 100) : 0);
  const overdue = !!x.due_at && new Date(x.due_at).setHours(23, 59, 59, 999) < Date.now();

  async function onDelete() {
    const ok = await confirm({
      title: `Delete “${x.name}”?`,
      message: `${peso(x.amount_cents)} goes back to the credit limit.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await deleteExpense(x.id);
    router.back();
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: x.name }} />

      {/* Hero: the amount, and what you owe of it */}
      <View className="gap-4 rounded-3xl bg-primary p-6">
        <View className="gap-1">
          <Text className="text-sm font-medium text-on-ink-muted">{x.name}</Text>
          <Money cents={x.amount_cents} className="text-4xl font-extrabold tracking-tight text-on-ink" />
        </View>
        {mine ? (
          <View className="flex-row items-center justify-between border-t border-hero-track pt-4">
            <Text className="text-sm text-on-ink-muted">Your share</Text>
            <Money cents={mine.amount_cents} className="text-lg font-bold text-on-ink-good" />
          </View>
        ) : null}
      </View>

      <ListCard>
        <DetailRow first icon="calendar-outline" label="Spent on">
          {formatDay(x.spent_at)}, {formatTime(x.spent_at)}
        </DetailRow>
        <DetailRow icon="alarm-outline" label="Due date" tone={overdue ? 'over' : undefined}>
          {x.due_at ? `${dueLabel(x.due_at).replace(/^Due /, '')}${overdue ? ' · past due' : ''}` : 'No due date'}
        </DetailRow>
        <DetailRow
          icon="wallet-outline"
          label="Budget"
          onPress={() => router.navigate(`/group/${group.id}`)}
          hint="Opens the budget"
        >
          {group.name}
        </DetailRow>
        <DetailRow icon={exact ? 'calculator-outline' : 'git-compare-outline'} label="Split">
          {exact ? 'Exact amounts' : 'By shares'} · {x.splits.length} {x.splits.length === 1 ? 'person' : 'people'}
        </DetailRow>
      </ListCard>

      <SectionTitle>Who owes what</SectionTitle>
      <ListCard>
        {x.splits.map((s, i) => {
          const isMe = people.isMe(s.member_id);
          return (
            <Pressable
              key={s.member_id}
              accessibilityRole="button"
              accessibilityLabel={`${people.nameOf(s.member_id)}, ${peso(s.amount_cents)}, ${pct(s.amount_cents)} percent`}
              accessibilityHint="Opens this person's share in the budget"
              onPress={() =>
                router.push({ pathname: '/group/[id]/person/[memberId]', params: { id, memberId: s.member_id } })
              }
              className="active:bg-muted"
            >
              <Row first={i === 0}>
                <View className="flex-row items-center gap-3">
                  <Avatar
                    name={people.nameOf(s.member_id)}
                    color={people.colorOf(s.member_id)}
                    uri={people.avatarOf(s.member_id)}
                    size={36}
                  />
                  <View className="flex-1 gap-0.5">
                    <Text className={cx('text-base font-semibold', isMe && 'text-remaining')}>
                      {people.nameOf(s.member_id)}
                    </Text>
                    <Text className="text-xs text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>
                      {pct(s.amount_cents)}% of the total{!exact && s.weight > 1 ? ` · ${s.weight}× share` : ''}
                    </Text>
                  </View>
                  <Money cents={s.amount_cents} />
                </View>
              </Row>
            </Pressable>
          );
        })}
      </ListCard>
      <View className="flex-row justify-end px-1">
        <Pill tone="good" icon="checkmark-circle">
          Adds up to {peso(x.splits.reduce((a, s) => a + s.amount_cents, 0))}
        </Pill>
      </View>

      <Button title="Delete expense" icon="trash-outline" variant="danger" onPress={onDelete} />
    </Screen>
  );
}

function DetailRow({
  icon,
  label,
  children,
  first,
  tone,
  onPress,
  hint,
}: {
  icon: IconName;
  label: string;
  children: ReactNode;
  first?: boolean;
  tone?: 'over';
  onPress?: () => void;
  hint?: string;
}) {
  const body = (
    <Row first={first}>
      <View className="min-h-8 flex-row items-center gap-3">
        <IconWell name={icon} size={36} tone={tone === 'over' ? 'over' : 'neutral'} />
        <View className="flex-1 gap-0.5">
          <Text className="text-xs font-medium text-muted-foreground">{label}</Text>
          <Text className={cx('text-base font-semibold', tone === 'over' && 'text-destructive')}>{children}</Text>
        </View>
        {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null}
      </View>
    </Row>
  );
  if (!onPress) return <View accessible>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityHint={hint} onPress={onPress} className="active:bg-muted">
      {body}
    </Pressable>
  );
}
