import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';

import { Progress } from '@/components/ui/progress';
import { Text } from '@/components/ui/text';
import { peso } from '@/lib/money';
import { mediaUrl } from '@/lib/media';
import {
  getMyAvatar,
  getMyUsername,
  GroupWithSpent,
  listAllEvents,
  listAllExpenses,
  listAllMembers,
  listGroups,
} from '@/lib/repo';
import { useQuery } from '@/lib/useQuery';
import {
  Avatar,
  Button,
  Card,
  CreditGauge,
  cx,
  EmptyState,
  ListCard,
  Loading,
  Money,
  Muted,
  Screen,
  SectionTitle,
  SyncBanner,
  TabHeader,
  TextLink,
} from '@/ui/components';
import { EventCard, ExpenseRow, peopleFrom } from '@/ui/rows';
import { colors, personColors } from '@/ui/theme';
import { InvitationCard } from '@/ui/InvitationCard';
import { NotificationBell } from '@/ui/NotificationBell';
import { startTourIfNew, tourTarget } from '@/ui/Tour';
import { useAddExpense } from '@/ui/useAddExpense';
import { useInvitations } from '@/ui/useNotifications';
import { WeekChart } from '@/ui/WeekChart';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const groups = useQuery(listGroups, []);
  const members = useQuery(listAllMembers, []);
  const expenses = useQuery(listAllExpenses, []);
  const events = useQuery(listAllEvents, []);
  const me = useQuery(getMyUsername, []);
  const myAvatar = useQuery(getMyAvatar, []);
  const { invitations, setInvitations } = useInvitations();
  const addExpense = useAddExpense();

  // An account's first time on Home on this phone: the guided tour (ui/Tour.tsx).
  const ready = !!groups && !!members && !!expenses && !!events && me !== undefined;
  useEffect(() => {
    if (ready) void startTourIfNew(me ?? null);
  }, [ready, me]);
  const newBudget = () => router.push('/new-budget');

  if (!groups || !members || !expenses || !events || me === undefined) return <Loading />;

  const people = peopleFrom(members, me);
  const totalLimit = groups.reduce((a, g) => a + g.credit_limit_cents, 0);
  const totalSpent = groups.reduce((a, g) => a + g.spent_cents, 0);
  const totalLeft = totalLimit - totalSpent;
  const overCount = groups.filter((g) => g.spent_cents > g.credit_limit_cents).length;
  const linked = members.some((m) => people.isMe(m.id));
  const myShare = expenses.reduce(
    (a, x) => a + (x.splits.find((s) => people.isMe(s.member_id))?.amount_cents ?? 0),
    0,
  );
  const now = new Date().toISOString();
  const upcoming = events.filter((e) => e.starts_at >= now).slice(0, 2);
  const recent = expenses.slice(0, 3);
  const budgetName = (id: string) => groups.find((g) => g.id === id)?.name;
  const many = groups.length > 1;

  // Getting started: disappears once all three are done.
  const firstGroup = groups[0];
  const steps = [
    {
      done: groups.length > 0,
      title: 'Create a budget',
      body: 'Name it and set the credit limit you share.',
      icon: 'wallet-outline' as const,
      onPress: newBudget,
    },
    {
      done: members.some((m) => !m.deleted),
      title: 'Add the people',
      body: 'Invite them by username so they see it too.',
      icon: 'people-outline' as const,
      onPress: () => (firstGroup ? router.push(`/group/${firstGroup.id}/new-person`) : newBudget()),
    },
    {
      done: expenses.length > 0,
      title: 'Add your first expense',
      body: "It's split between the people involved.",
      icon: 'receipt-outline' as const,
      onPress: addExpense,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <Screen tab>
      <TabHeader
        title={greeting()}
        subtitle={me ? `@${me}` : undefined}
        action={
          <View className="flex-row items-center gap-2">
            <View ref={tourTarget('bell')} collapsable={false}>
              <NotificationBell />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={me ? `Profile, @${me}` : 'Profile'}
              onPress={() => router.navigate('/profile')}
              hitSlop={4}
              className="rounded-full active:opacity-70"
            >
              <Avatar name={me ?? '?'} color={personColors[1]} uri={mediaUrl(myAvatar)} size={48} />
            </Pressable>
          </View>
        }
      />
      <SyncBanner />

      {invitations.map((inv) => (
        <InvitationCard
          key={inv.member_id}
          invitation={inv}
          onDone={(groupId) => {
            setInvitations((all) => all.filter((x) => x.member_id !== inv.member_id));
            if (groupId) router.push(`/group/${groupId}`);
          }}
        />
      ))}

      {doneCount < steps.length && (
        <Card>
          <View className="flex-row items-center justify-between">
            <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
              Getting started
            </Text>
            <Text className="text-xs font-semibold text-muted-foreground">
              {doneCount} of {steps.length}
            </Text>
          </View>
          <Progress
            value={(doneCount / steps.length) * 100}
            accessibilityLabel={`${doneCount} of ${steps.length} steps done`}
            className="h-1.5 bg-track"
            indicatorClassName="bg-remaining"
          />
          {steps.map((s) => (
            <Pressable
              key={s.title}
              accessibilityRole="button"
              accessibilityLabel={`${s.title}${s.done ? ', done' : ''}`}
              accessibilityHint={s.done ? undefined : s.body}
              accessibilityState={{ disabled: s.done }}
              disabled={s.done}
              onPress={s.onPress}
              className="min-h-12 flex-row items-center gap-3 rounded-lg bg-muted px-4 py-3 active:opacity-70"
            >
              <View
                className={cx('h-8 w-8 items-center justify-center rounded-full', s.done ? 'bg-remaining' : 'bg-card')}
              >
                <Ionicons name={s.done ? 'checkmark' : s.icon} size={16} color={s.done ? colors.onInk : colors.ink} />
              </View>
              <View className="flex-1">
                <Text className={cx('text-sm font-semibold', s.done ? 'text-muted-foreground line-through' : 'text-foreground')}>
                  {s.title}
                </Text>
                {!s.done && <Text className="text-xs text-muted-foreground">{s.body}</Text>}
              </View>
              {!s.done && <Ionicons name="chevron-forward" size={16} color={colors.muted} />}
            </Pressable>
          ))}
        </Card>
      )}

      {groups.length > 0 && (
        <View className="gap-5 rounded-3xl bg-primary p-6">
          <View className="gap-1">
            <Text className="text-sm font-medium text-on-ink-muted">
              {totalLeft < 0 ? 'Over the credit limit by' : 'Credit left'}
              {many ? ` · ${groups.length} budgets` : ` · ${groups[0].name}`}
            </Text>
            <Money
              cents={Math.abs(totalLeft)}
              className={cx('text-4xl font-extrabold tracking-tight', totalLeft < 0 ? 'text-on-ink-over' : 'text-on-ink')}
            />
          </View>
          <CreditGauge
            limit={totalLimit}
            tone="dark"
            segments={[{ key: 'spent', value: totalSpent, color: colors.onInkGood }]}
          />
          <View className="flex-row">
            <View className="flex-1 gap-0.5">
              <Text className="text-xs font-medium text-on-ink-muted">Spent</Text>
              <Money cents={totalSpent} className="text-base text-on-ink" />
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="text-xs font-medium text-on-ink-muted">Limit</Text>
              <Money cents={totalLimit} className="text-base text-on-ink" />
            </View>
            {linked && (
              <View className="flex-1 gap-0.5">
                <Text className="text-xs font-medium text-on-ink-muted">Your share</Text>
                <Money cents={myShare} className="text-base text-on-ink-good" />
              </View>
            )}
          </View>
          {overCount > 0 && many && (
            <View className="flex-row items-center gap-2">
              <Ionicons name="alert-circle" size={16} color={colors.onInkOver} />
              <Text className="text-xs font-medium text-on-ink-over">
                {overCount} budget{overCount === 1 ? ' is' : 's are'} over the limit
              </Text>
            </View>
          )}
        </View>
      )}

      {expenses.length > 0 && <WeekChart expenses={expenses} />}

      <SectionTitle
        action={
          <View ref={tourTarget('new-budget')} collapsable={false}>
            <TextLink title="New budget" icon="add" onPress={newBudget} />
          </View>
        }
      >
        Budgets
      </SectionTitle>
      {groups.length === 0 && (
        <EmptyState icon="wallet-outline" title="No budgets yet">
          Create one for an activity, like “Org fair” with a ₱10,000 credit limit.
        </EmptyState>
      )}
      {groups.map((g) => (
        <BudgetCard key={g.id} group={g} />
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create a new budget"
        onPress={newBudget}
        className="min-h-14 flex-row items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-border px-4 py-4 active:bg-muted"
      >
        <Ionicons name="add-circle-outline" size={20} color={colors.ink} />
        <Text className="text-base font-semibold text-foreground">Create a new budget</Text>
      </Pressable>

      {upcoming.length > 0 && (
        <>
          <SectionTitle action={<TextLink title="All" onPress={() => router.navigate('/events')} />}>Upcoming</SectionTitle>
          {upcoming.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              isPast={false}
            />
          ))}
        </>
      )}

      {recent.length > 0 && (
        <>
          <SectionTitle action={<TextLink title="All" onPress={() => router.navigate('/expenses')} />}>
            Recent expenses
          </SectionTitle>
          <ListCard>
            {recent.map((x, i) => (
              <ExpenseRow
                key={x.id}
                expense={x}
                first={i === 0}
                people={people}
                budgetName={many ? budgetName(x.group_id) : undefined}
              />
            ))}
          </ListCard>
        </>
      )}
    </Screen>
  );
}

function BudgetCard({ group: g }: { group: GroupWithSpent }) {
  const remaining = g.credit_limit_cents - g.spent_cents;
  const over = remaining < 0;
  const status = over ? `over by ${peso(-remaining)}` : `${peso(remaining)} left`;
  const pct = g.credit_limit_cents > 0 ? Math.round((g.spent_cents / g.credit_limit_cents) * 100) : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${g.name}, ${status} of ${peso(g.credit_limit_cents)}`}
      accessibilityHint="Opens the budget"
      onPress={() => router.push(`/group/${g.id}`)}
      className="active:opacity-80"
    >
      <Card>
        <View className="flex-row items-center justify-between gap-3">
          <Text className="flex-shrink text-base font-semibold text-foreground">{g.name}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </View>
        <View className="flex-row items-end justify-between gap-3">
          <View className="gap-0.5">
            <Muted>{over ? 'Over the credit limit by' : 'Credit left'}</Muted>
            <Money
              cents={Math.abs(remaining)}
              className={cx('text-2xl font-extrabold tracking-tight', over ? 'text-destructive' : 'text-foreground')}
            />
          </View>
          <Text className="text-xs font-semibold text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>
            {pct}% used
          </Text>
        </View>
        <CreditGauge
          limit={g.credit_limit_cents}
          segments={[{ key: 'spent', value: g.spent_cents, color: over ? colors.over : colors.ink }]}
          height={8}
        />
        <Muted>
          {peso(g.spent_cents)} spent of {peso(g.credit_limit_cents)}
        </Muted>
      </Card>
    </Pressable>
  );
}
