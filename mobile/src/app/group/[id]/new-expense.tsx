import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';

import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Text } from '@/components/ui/text';
import { formatDay, peso, toCents } from '@/lib/money';
import { addExpense, getGroup, listExpenses, listMembers, Member, summarize } from '@/lib/repo';
import { splitAmount } from '@/lib/split';
import { useQuery } from '@/lib/useQuery';
import {
  Avatar,
  Button,
  Card,
  cx,
  EmptyState,
  ErrorText,
  Field,
  IconName,
  ListCard,
  Loading,
  Muted,
  Pill,
  Row,
  Screen,
  SectionTitle,
  TextLink,
} from '@/ui/components';
import { confirm } from '@/ui/dialog';
import { colors, personColorMap } from '@/ui/theme';

type SplitMode = 'shares' | 'amounts';
type Picking = 'spent' | 'due' | null;

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const dayLabel = (d: Date) => (sameDay(d, new Date()) ? 'Today' : formatDay(d.toISOString()));

/** Today at noon: a due date is a day, and noon keeps it on that day in any time zone shift. */
function todayNoon() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}

export default function NewExpense() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useQuery(() => getGroup(id), [id]);
  const members = useQuery(() => listMembers(id), [id]);
  const expenses = useQuery(() => listExpenses(id), [id]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<SplitMode>('shares');
  const [weightsDraft, setWeights] = useState<Record<string, number> | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({}); // exact amounts, as typed
  const [spentAtDraft, setSpentAt] = useState<Date | null>(null);
  const [dueAt, setDueAt] = useState<Date>(todayNoon);
  const [picking, setPicking] = useState<Picking>(null);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  if (group === undefined || !members || !expenses) return <Loading />;
  if (group === null) {
    return (
      <Screen>
        <EmptyState icon="trash-outline" title="This budget was deleted">
          It was removed, maybe on another phone, so expenses can't be added to it.
        </EmptyState>
      </Screen>
    );
  }

  const colorOf = personColorMap(members);
  const active = members.filter((m) => !m.deleted);

  const today = new Date();
  const spentAt = spentAtDraft ?? today;

  const amountCents = toCents(amount);

  // ---- by shares: everyone starts included with an equal share ----
  const weights = weightsDraft ?? Object.fromEntries(active.map((m) => [m.id, 1]));
  const setWeight = (memberId: string, w: number) => setWeights({ ...weights, [memberId]: Math.max(0, Math.min(9, w)) });
  const sharePeople = active.filter((m) => (weights[m.id] ?? 0) > 0).map((m) => ({ memberId: m.id, weight: weights[m.id] }));
  const shares =
    amountCents !== null && sharePeople.length > 0 ? splitAmount(amountCents, sharePeople.map((p) => p.weight)) : null;
  const shareOf = new Map(sharePeople.map((p, i) => [p.memberId, shares?.[i]]));

  // ---- exact amounts: whoever has an amount above zero is included ----
  const exact = Object.fromEntries(active.map((m) => [m.id, typed[m.id]?.trim() ? toCents(typed[m.id]) : 0]));
  const badEntry = active.find((m) => exact[m.id] === null);
  const exactPeople = active.filter((m) => (exact[m.id] ?? 0) > 0);
  const assigned = exactPeople.reduce((a, m) => a + (exact[m.id] ?? 0), 0);
  const leftToAssign = (amountCents ?? 0) - assigned;

  const remainingNow = summarize(group, expenses).remaining;
  const remainingAfter = remainingNow - (amountCents ?? 0);

  function onPicked(picked: Date) {
    if (picking === 'spent') {
      const d = new Date(picked);
      d.setHours(spentAt.getHours(), spentAt.getMinutes(), 0, 0);
      setSpentAt(d);
    } else if (picking === 'due') {
      const d = new Date(picked);
      d.setHours(12, 0, 0, 0);
      setDueAt(d);
    }
    if (Platform.OS === 'android') setPicking(null); // Android shows a dialog that closes itself
  }

  async function save() {
    if (saving) return;
    if (amountCents === null || amountCents === 0) return setError('Enter the amount in pesos, like 500.');
    if (!name.trim()) return setError('Name the expense, like “Printables”.');
    let amounts: Record<string, number> | undefined;
    let people: { memberId: string; weight: number }[];
    if (mode === 'amounts') {
      if (badEntry) return setError(`Check ${badEntry.name}'s amount: enter pesos, like 150 or 150.50.`);
      if (exactPeople.length === 0) return setError("Enter how much at least one person owes.");
      if (leftToAssign !== 0) {
        return setError(
          `The people's amounts add up to ${peso(assigned)}, but the expense is ${peso(amountCents)}. Make them match.`,
        );
      }
      people = exactPeople.map((m) => ({ memberId: m.id, weight: 1 }));
      amounts = Object.fromEntries(exactPeople.map((m) => [m.id, exact[m.id] as number]));
    } else {
      if (sharePeople.length === 0) return setError('Pick at least one person who was involved.');
      people = sharePeople;
    }
    if (remainingAfter < 0) {
      const ok = await confirm({
        title: 'Over the credit limit',
        message: `This puts the budget ${peso(-remainingAfter)} over its limit. Save anyway?`,
        confirmLabel: 'Save anyway',
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      await addExpense({ groupId: id, name: name.trim(), amountCents, spentAt, dueAt, people, amounts });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  const dateTile = (kind: 'spent' | 'due', icon: IconName, label: string, value: Date) => {
    const on = picking === kind;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${dayLabel(value)}`}
        accessibilityHint="Opens a date picker"
        accessibilityState={{ expanded: on }}
        onPress={() => setPicking(on ? null : kind)}
        className={cx('flex-1 gap-1 rounded-lg border bg-card p-4 active:opacity-70', on ? 'border-primary' : 'border-border')}
      >
        <View className="flex-row items-center gap-1.5">
          <Ionicons name={icon} size={14} color={colors.muted} />
          <Text className="text-xs font-medium text-muted-foreground">{label}</Text>
        </View>
        <Text className="text-base font-semibold">{dayLabel(value)}</Text>
      </Pressable>
    );
  };

  return (
    <Screen>
      <Card className="items-center py-6">
        <Text className="text-sm font-medium text-muted-foreground">Amount</Text>
        <View className="flex-row items-center gap-1">
          <Text className="text-4xl font-extrabold text-muted-foreground">₱</Text>
          <TextInput
            accessibilityLabel="Amount in pesos"
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={colors.placeholder}
            keyboardType="decimal-pad"
            autoFocus
            className="min-w-24 py-1 text-4xl font-extrabold tracking-tight text-foreground"
            style={{ fontVariant: ['tabular-nums'] }}
          />
        </View>
        <View accessibilityLiveRegion="polite">
          {remainingAfter < 0 ? (
            <Pill tone="over" icon="alert-circle">
              {peso(-remainingAfter)} over the limit after this
            </Pill>
          ) : (
            <Pill tone="good" icon="checkmark-circle">
              {peso(remainingAfter)} left after this
            </Pill>
          )}
        </View>
      </Card>

      <Field label="What was it for?" value={name} onChangeText={setName} placeholder="Printables" returnKeyType="done" />

      <View className="gap-2">
        <View className="flex-row gap-3">
          {dateTile('spent', 'calendar-outline', 'Spent on', spentAt)}
          {dateTile('due', 'alarm-outline', 'Due date', dueAt)}
        </View>
        {picking && (
          <View>
            <DateTimePicker
              value={picking === 'spent' ? spentAt : dueAt}
              mode="date"
              maximumDate={picking === 'spent' ? today : undefined}
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onValueChange={(_, date) => onPicked(date)}
              onDismiss={() => setPicking(null)}
            />
            {Platform.OS === 'ios' && <Button title="Done" variant="secondary" onPress={() => setPicking(null)} />}
          </View>
        )}
        <Muted>The due date is when everyone should have paid their part.</Muted>
      </View>

      <SectionTitle>Who was involved?</SectionTitle>
      <Tabs value={mode} onValueChange={(v) => setMode(v as SplitMode)}>
        <TabsList className="mr-0 h-auto w-full rounded-full bg-card p-1">
          {(
            [
              ['shares', 'By shares'],
              ['amounts', 'Exact amounts'],
            ] as const
          ).map(([value, label]) => {
            const on = mode === value;
            return (
              <TabsTrigger key={value} value={value} className={cx('h-auto min-h-11 flex-1 rounded-full', on && 'bg-primary')}>
                <Text className={cx('text-sm font-semibold', on ? 'text-on-ink' : 'text-muted-foreground')}>{label}</Text>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {mode === 'shares' ? (
        <>
          <Muted>Tap a name to include or leave someone out. Use + if someone used more: 2× pays twice the share.</Muted>
          <ListCard>
            {active.map((m, i) => (
              <ShareRow
                key={m.id}
                member={m}
                first={i === 0}
                weight={weights[m.id] ?? 0}
                share={shareOf.get(m.id)}
                color={colorOf.get(m.id) ?? colors.track}
                setWeight={(w) => setWeight(m.id, w)}
              />
            ))}
          </ListCard>
        </>
      ) : (
        <>
          <Muted>Type what each person owes. Leave someone empty to leave them out.</Muted>
          <ListCard>
            {active.map((m, i) => (
              <Row key={m.id} first={i === 0}>
                <View className="flex-row items-center gap-3">
                  <Avatar name={m.name} color={colorOf.get(m.id) ?? colors.track} size={32} />
                  <Text className="flex-1 text-base font-semibold">{m.name}</Text>
                  <Text className="text-base font-semibold text-muted-foreground">₱</Text>
                  <Input
                    accessibilityLabel={`${m.name}'s amount in pesos`}
                    value={typed[m.id] ?? ''}
                    onChangeText={(v) => setTyped({ ...typed, [m.id]: v })}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    className={cx(
                      'h-auto min-h-11 w-28 rounded-lg bg-muted px-3 py-2 text-right placeholder:text-placeholder',
                      exact[m.id] === null && 'border-destructive',
                    )}
                    style={{ fontVariant: ['tabular-nums'] }}
                  />
                </View>
              </Row>
            ))}
          </ListCard>
          <View accessibilityLiveRegion="polite" className="flex-row flex-wrap items-center gap-3">
            {amountCents === null ? (
              <Pill tone="neutral" icon="calculator-outline">
                {peso(assigned)} assigned
              </Pill>
            ) : leftToAssign === 0 ? (
              <Pill tone="good" icon="checkmark-circle">
                Adds up to {peso(amountCents)}
              </Pill>
            ) : leftToAssign > 0 ? (
              <Pill tone="neutral" icon="ellipsis-horizontal-circle-outline">
                {peso(leftToAssign)} left to assign
              </Pill>
            ) : (
              <Pill tone="over" icon="alert-circle">
                {peso(-leftToAssign)} too much
              </Pill>
            )}
            {amountCents === null && assigned > 0 && (
              <TextLink title={`Use ${peso(assigned)} as the total`} onPress={() => setAmount((assigned / 100).toFixed(2))} />
            )}
          </View>
        </>
      )}

      <ErrorText>{error}</ErrorText>
      <Button title="Save expense" icon="checkmark" onPress={save} busy={saving} />
    </Screen>
  );
}

/** One person in "By shares": tap to include, − / + to change their weight. */
function ShareRow({
  member: m,
  first,
  weight: w,
  share,
  color,
  setWeight,
}: {
  member: Member;
  first: boolean;
  weight: number;
  share: number | undefined;
  color: string;
  setWeight: (w: number) => void;
}) {
  const included = w > 0;
  return (
    <Row first={first}>
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={() => setWeight(included ? 0 : 1)}
          accessibilityRole="checkbox"
          accessibilityLabel={m.name}
          accessibilityState={{ checked: included }}
          accessibilityValue={included && share !== undefined ? { text: `${peso(share)} share` } : undefined}
          className="min-h-11 flex-1 flex-row items-center gap-3 active:opacity-70"
        >
          {included ? (
            <View className="h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: color }}>
              <Ionicons name="checkmark" size={18} color={colors.ink} />
            </View>
          ) : (
            <Avatar name={m.name} color={colors.sunken} size={32} />
          )}
          <View className="flex-1">
            <Text className={cx('text-base font-semibold', included ? 'text-foreground' : 'text-muted-foreground')}>
              {m.name}
            </Text>
            {included && share !== undefined ? (
              <Text className="text-sm text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>
                {peso(share)}
              </Text>
            ) : !included ? (
              <Text className="text-sm text-muted-foreground">Not included</Text>
            ) : null}
          </View>
        </Pressable>
        {included && (
          <View className="flex-row items-center gap-1">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={w === 1 ? `Leave ${m.name} out` : `Lower ${m.name}'s share`}
              onPress={() => setWeight(w - 1)}
              hitSlop={4}
              className="h-10 w-10 items-center justify-center rounded-full bg-muted active:opacity-60"
            >
              <Ionicons name="remove" size={18} color={colors.ink} />
            </Pressable>
            <Text
              accessibilityLabel={`${m.name} pays ${w} times the share`}
              className="min-w-8 text-center text-base font-bold text-foreground"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {w}×
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Raise ${m.name}'s share`}
              accessibilityState={{ disabled: w >= 9 }}
              disabled={w >= 9}
              onPress={() => setWeight(w + 1)}
              hitSlop={4}
              className={cx('h-10 w-10 items-center justify-center rounded-full bg-muted active:opacity-60', w >= 9 && 'opacity-40')}
            >
              <Ionicons name="add" size={18} color={colors.ink} />
            </Pressable>
          </View>
        )}
      </View>
    </Row>
  );
}
