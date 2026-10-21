import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { peso, toCents } from '@/lib/money';
import { mediaUrl } from '@/lib/media';
import {
  addMember,
  getGroup,
  getMyUsername,
  inviteStatus,
  isMemberMe,
  listExpenses,
  listMembers,
  Member,
  removeMember,
  sameUser,
  setCreditLimit,
  sharesOf,
  summarize,
} from '@/lib/repo';
import { useQuery } from '@/lib/useQuery';
import {
  Avatar,
  Button,
  Card,
  CreditGauge,
  cx,
  EmptyState,
  IconName,
  IconWell,
  ListCard,
  Loading,
  Money,
  Muted,
  Screen,
  SectionTitle,
  SyncBanner,
  TextLink,
} from '@/ui/components';
import { confirm, prompt } from '@/ui/dialog';
import { ExpenseRow, onDelete, peopleFrom } from '@/ui/rows';
import { colors, personColorMap } from '@/ui/theme';

/** How many expenses the budget page previews; the Expenses tab shows the rest. */
const PREVIEW_EXPENSES = 3;

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useQuery(() => getGroup(id), [id]);
  const members = useQuery(() => listMembers(id), [id]);
  const expenses = useQuery(() => listExpenses(id), [id]);
  const me = useQuery(getMyUsername, []);

  if (group === undefined || !members || !expenses || me === undefined) return <Loading />;
  if (group === null) {
    return (
      <Screen>
        <EmptyState icon="trash-outline" title="This budget was deleted" />
      </Screen>
    );
  }

  const { limit, spent, remaining, usedBy } = summarize(group, expenses);
  const over = remaining < 0;
  const active = members.filter((m) => !m.deleted);
  const colorOf = personColorMap(members);
  const meMember = active.find((m) => isMemberMe(m, me));
  const isOwner = sameUser(group.owner_username, me);
  const ownerMember = active.find(
    (m) => sameUser(m.joined_username, group.owner_username) || (isOwner && m.id === meMember?.id),
  );
  const myShare = meMember ? sharesOf(meMember.id, expenses) : null;
  const nameOf = (memberId: string) => {
    const name = members.find((m) => m.id === memberId)?.name ?? 'Removed person';
    return memberId === meMember?.id ? `${name} (you)` : name;
  };
  const openPerson = (memberId: string) =>
    router.push({ pathname: '/group/[id]/person/[memberId]', params: { id, memberId } });
  const people = peopleFrom(members, me);
  const segments = members
    .map((m) => ({ key: m.id, value: usedBy.get(m.id) ?? 0, color: colorOf.get(m.id) ?? colors.onInkMuted }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
  const pctUsed = limit > 0 ? Math.round((spent / limit) * 100) : 0;

  async function changeLimit() {
    const value = await prompt({
      title: 'Change credit limit',
      message: `${peso(spent)} has been spent so far in this budget.`,
      label: 'Credit limit (₱)',
      initial: (limit / 100).toFixed(2).replace(/\.00$/, ''),
      placeholder: '10,000',
      keyboardType: 'decimal-pad',
      confirmLabel: 'Save limit',
      validate: (v) => (toCents(v) === null ? 'Enter an amount like 10000 or 10,000.50.' : null),
    });
    if (value === null) return;
    const cents = toCents(value)!;
    if (cents < spent) {
      const ok = await confirm({
        title: "That's less than what's spent",
        message: `${peso(spent)} has already been spent, so the budget will be ${peso(spent - cents)} over its new limit. Save anyway?`,
        confirmLabel: 'Save anyway',
      });
      if (!ok) return;
    }
    await setCreditLimit(group!.id, cents);
  }

  async function confirmRemoveMember(m: Member) {
    const ok = await confirm({
      title: `Remove ${m.name}?`,
      message: m.joined_username
        ? `Their share in past expenses stays as it is, and @${m.joined_username} loses access to this budget.`
        : 'Their share in past expenses stays as it is.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (ok) await removeMember(m.id);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: group.name }} />
      <SyncBanner />

      {/* Hero: the answer to "how much credit is left?" */}
      <View className="gap-5 rounded-3xl bg-primary p-6">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="text-sm font-medium text-on-ink-muted">
              {over ? 'Over the credit limit by' : 'Credit left'}
            </Text>
            <Money
              cents={Math.abs(remaining)}
              className={cx('text-4xl font-extrabold tracking-tight', over ? 'text-on-ink-over' : 'text-on-ink')}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change credit limit"
            accessibilityHint="Opens a dialog to set a new limit"
            onPress={changeLimit}
            hitSlop={6}
            className="min-h-9 flex-row items-center gap-1.5 rounded-full bg-hero-track px-3 active:opacity-70"
          >
            <Ionicons name="pencil" size={14} color={colors.onInk} />
            <Text className="text-xs font-semibold text-on-ink">Limit</Text>
          </Pressable>
        </View>

        <View className="gap-2">
          <CreditGauge limit={limit} segments={segments} tone="dark" />
          <View className="flex-row justify-between">
            <Text className="text-xs font-medium text-on-ink-muted">
              {peso(spent)} spent{limit > 0 ? ` · ${pctUsed}%` : ''}
            </Text>
            <Text className="text-xs font-medium text-on-ink-muted">{peso(limit)} limit</Text>
          </View>
        </View>

        {segments.length > 0 && (
          <View className="gap-3 border-t border-hero-track pt-4">
            {segments.map((s) => (
              <View key={s.key} className="flex-row items-center gap-3">
                <Avatar name={nameOf(s.key)} color={s.color} uri={people.avatarOf(s.key)} size={28} />
                <Text className="flex-1 text-sm text-on-ink">{nameOf(s.key)}</Text>
                <Money cents={s.value} className="text-sm text-on-ink" />
              </View>
            ))}
          </View>
        )}
      </View>

      {myShare ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Your share, ${peso(myShare.total)}, from ${myShare.items.length} expenses`}
          accessibilityHint="Shows each expense you owe for"
          onPress={() => openPerson(meMember!.id)}
          className="active:opacity-80"
        >
          <Card className="flex-row items-center">
            <IconWell name="person-outline" tone="good" />
            <View className="flex-1 gap-0.5">
              <Text className="text-sm font-medium text-muted-foreground">Your share</Text>
              <Money cents={myShare.total} className="text-2xl font-extrabold tracking-tight text-foreground" />
              <Text className="text-xs text-muted-foreground">
                From {myShare.items.length} expense{myShare.items.length === 1 ? '' : 's'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Card>
        </Pressable>
      ) : isOwner && me ? (
        <Card>
          <View className="flex-row items-center gap-3">
            <IconWell name="person-add-outline" tone="good" />
            <View className="flex-1 gap-0.5">
              <Text className="text-base font-semibold">You're not in the split yet</Text>
              <Muted>Add yourself so the people you invite see you, and you see your own share.</Muted>
            </View>
          </View>
          <Button title="Add me" icon="person-add-outline" variant="secondary" onPress={() => addMember(id, me, me)} />
          {active.length > 0 && (
            <Muted>Already listed under another name? Tap it under People and choose “This is me”.</Muted>
          )}
        </Card>
      ) : null}

      <Button
        title="Add expense"
        icon="add"
        onPress={() => router.push(`/group/${id}/new-expense`)}
        disabled={active.length === 0}
      />
      {active.length === 0 && <Muted>Add the people in this budget first, so expenses can be split between them.</Muted>}

      <SectionTitle
        action={
          <TextLink title="Add" icon="person-add-outline" onPress={() => router.push(`/group/${id}/new-person`)} />
        }
      >
        People
      </SectionTitle>
      {active.length === 0 ? (
        <EmptyState icon="people-outline" title="No people yet">
          Add everyone sharing this budget. Invite them by username so they see it on their phone.
        </EmptyState>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {active.map((m) => {
            const status = inviteStatus(m);
            const isMe = m.id === meMember?.id;
            const owner = m.id === ownerMember?.id;
            const badge: { icon: IconName; color: string; label: string } | null = isMe
              ? { icon: 'person-circle', color: colors.remaining, label: 'you' }
              : status === 'joined'
                ? { icon: 'checkmark-circle', color: colors.remaining, label: 'joined' }
                : status === 'pending'
                  ? { icon: 'time-outline', color: colors.muted, label: 'invite pending' }
                  : null;
            return (
              <Pressable
                key={m.id}
                accessibilityRole="button"
                accessibilityLabel={`${m.name}${owner ? ', owner' : ''}${badge ? `, ${badge.label}` : ''}, ${peso(usedBy.get(m.id) ?? 0)} share`}
                accessibilityHint="Shows their share and invite, and lets you remove them."
                accessibilityActions={[{ name: 'delete', label: 'Remove' }]}
                onAccessibilityAction={onDelete(() => confirmRemoveMember(m))}
                onPress={() => openPerson(m.id)}
                className="min-h-11 flex-row items-center gap-2 rounded-full bg-card py-1.5 pl-1.5 pr-4 active:opacity-70"
              >
                <Avatar name={m.name} color={colorOf.get(m.id) ?? colors.track} uri={mediaUrl(m.joined_avatar)} size={30} />
                <Text className="text-sm font-medium text-foreground">{isMe ? `${m.name} (you)` : m.name}</Text>
                {owner && <Text className="text-xs font-semibold text-remaining">Owner</Text>}
                {badge && !isMe && !owner && <Ionicons name={badge.icon} size={16} color={badge.color} />}
              </Pressable>
            );
          })}
        </View>
      )}
      {!ownerMember && group.owner_username && !isOwner && (
        <Muted>Owner: @{group.owner_username} · not part of the split</Muted>
      )}
      {active.length > 0 && <Muted>Tap a person to see their share or invite them.</Muted>}

      <SectionTitle>Expenses</SectionTitle>
      {expenses.length === 0 ? (
        <EmptyState icon="receipt-outline" title="No expenses yet">
          Add the first one, like printables or snacks.
        </EmptyState>
      ) : (
        <>
          <ListCard>
            {expenses.slice(0, PREVIEW_EXPENSES).map((x, i) => (
              <ExpenseRow key={x.id} expense={x} first={i === 0} people={people} />
            ))}
          </ListCard>
          <Button
            title={`See all ${expenses.length} expense${expenses.length === 1 ? '' : 's'}`}
            icon="receipt-outline"
            variant="secondary"
            onPress={() => router.navigate({ pathname: '/expenses', params: { group: id } })}
          />
        </>
      )}
    </Screen>
  );
}
