import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDay, formatTime, peso, toCents } from '@/lib/money';
import {
  addMember,
  deleteEvent,
  deleteExpense,
  getGroup,
  listEvents,
  listExpenses,
  listMembers,
  Member,
  removeMember,
  setCreditLimit,
  summarize,
} from '@/lib/repo';
import { useQuery } from '@/lib/useQuery';
import { Button, Card, CreditGauge, ErrorText, Field, Loading, Money, Muted, Screen, SectionTitle, SyncBanner } from '@/ui/components';
import { colors, personColors, radius, space } from '@/ui/theme';

/** Stable color per person: based on their place in the (alphabetical) member list. */
function colorMap(members: Member[]) {
  return new Map(members.map((m, i) => [m.id, personColors[i % personColors.length]]));
}

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useQuery(() => getGroup(id), [id]);
  const members = useQuery(() => listMembers(id), [id]);
  const events = useQuery(() => listEvents(id), [id]);
  const expenses = useQuery(() => listExpenses(id), [id]);
  const [newMember, setNewMember] = useState('');
  const [limitDraft, setLimitDraft] = useState<string | null>(null);
  const [limitError, setLimitError] = useState<string>();

  if (group === undefined || !members || !events || !expenses) return <Loading />;
  if (group === null) {
    return (
      <Screen>
        <Muted>This budget was deleted.</Muted>
      </Screen>
    );
  }

  const { limit, spent, remaining, usedBy } = summarize(group, expenses);
  const active = members.filter((m) => !m.deleted);
  const colorOf = colorMap(members);
  const nameOf = (memberId: string) => members.find((m) => m.id === memberId)?.name ?? 'Removed person';
  const eventTitle = (eventId: string | null) => events.find((e) => e.id === eventId)?.title;
  const segments = members
    .map((m) => ({ key: m.id, value: usedBy.get(m.id) ?? 0, color: colorOf.get(m.id) ?? colors.muted }))
    .filter((s) => s.value > 0);
  const now = new Date().toISOString();
  const upcoming = events.filter((e) => e.starts_at >= now);
  const past = events.filter((e) => e.starts_at < now).reverse();

  async function saveLimit() {
    const cents = toCents(limitDraft ?? '');
    if (cents === null) return setLimitError('Enter an amount like 10000 or 10,000.50.');
    await setCreditLimit(group!.id, cents);
    setLimitDraft(null);
    setLimitError(undefined);
  }

  async function onAddMember() {
    const name = newMember.trim();
    if (!name) return;
    await addMember(id, name);
    setNewMember('');
  }

  function confirmRemoveMember(m: Member) {
    Alert.alert(`Remove ${m.name}?`, 'Their share in past expenses stays as it is.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeMember(m.id) },
    ]);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: group.name }} />
      <SyncBanner />

      <Card>
        <Muted>{remaining < 0 ? 'Over the credit limit by' : 'Credit left'}</Muted>
        <Money cents={Math.abs(remaining)} style={[styles.remaining, remaining < 0 && { color: colors.over }]} />
        <CreditGauge limit={limit} segments={segments} />
        <Muted>
          {peso(spent)} spent of {peso(limit)} credit limit
        </Muted>

        {segments.length > 0 && (
          <View style={{ gap: space(2) }}>
            {segments.map((s) => (
              <View key={s.key} style={styles.legendRow}>
                <View style={[styles.dot, { backgroundColor: s.color }]} />
                <Text style={styles.legendName}>{nameOf(s.key)}</Text>
                <Money cents={s.value} style={{ fontSize: 14 }} />
              </View>
            ))}
          </View>
        )}

        {limitDraft === null ? (
          <Pressable onPress={() => setLimitDraft(String(limit / 100))} hitSlop={8}>
            <Text style={styles.link}>Change credit limit</Text>
          </Pressable>
        ) : (
          <View style={{ gap: space(2) }}>
            <Field label="New credit limit (₱)" value={limitDraft} onChangeText={setLimitDraft} keyboardType="decimal-pad" />
            <ErrorText>{limitError}</ErrorText>
            <View style={{ flexDirection: 'row', gap: space(2) }}>
              <View style={{ flex: 1 }}>
                <Button title="Save limit" onPress={saveLimit} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Cancel" variant="secondary" onPress={() => setLimitDraft(null)} />
              </View>
            </View>
          </View>
        )}
      </Card>

      <Button
        title="Add expense"
        onPress={() => router.push(`/group/${id}/new-expense`)}
        disabled={active.length === 0}
      />
      {active.length === 0 && <Muted>Add the people in this budget first, so expenses can be split between them.</Muted>}

      <SectionTitle>People</SectionTitle>
      <View style={styles.chips}>
        {active.map((m) => (
          <Pressable key={m.id} onLongPress={() => confirmRemoveMember(m)} style={styles.chip}>
            <View style={[styles.dot, { backgroundColor: colorOf.get(m.id) }]} />
            <Text style={{ color: colors.ink }}>{m.name}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Field
            label="Add a person"
            value={newMember}
            onChangeText={setNewMember}
            placeholder="Name"
            onSubmitEditing={onAddMember}
            returnKeyType="done"
          />
        </View>
        <Button title="Add" variant="secondary" onPress={onAddMember} disabled={!newMember.trim()} />
      </View>
      {active.length > 0 && <Muted>Press and hold a name to remove that person.</Muted>}

      <SectionTitle
        action={
          <Pressable onPress={() => router.push(`/group/${id}/new-event`)} hitSlop={8}>
            <Text style={styles.link}>Schedule event</Text>
          </Pressable>
        }
      >
        Events
      </SectionTitle>
      {events.length === 0 && <Muted>No events yet. Schedule one to group expenses by activity and date.</Muted>}
      {[...upcoming, ...past].map((e) => {
        const total = expenses.filter((x) => x.event_id === e.id).reduce((a, x) => a + x.amount_cents, 0);
        const isPast = e.starts_at < now;
        return (
          <Pressable
            key={e.id}
            onPress={() => router.push({ pathname: '/group/[id]/new-expense', params: { id, eventId: e.id } })}
            onLongPress={() =>
              Alert.alert(`Delete “${e.title}”?`, 'Expenses linked to it are kept.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteEvent(e.id) },
              ])
            }
          >
            <Card style={[styles.eventCard, isPast && { opacity: 0.6 }]}>
              <View style={styles.dateBlock}>
                <Text style={styles.dateMonth}>{new Date(e.starts_at).toLocaleDateString('en-PH', { month: 'short' })}</Text>
                <Text style={styles.dateDay}>{new Date(e.starts_at).getDate()}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.itemTitle}>{e.title}</Text>
                <Muted>
                  {formatTime(e.starts_at)}
                  {e.location ? ` at ${e.location}` : ''}
                </Muted>
                <Muted>{total ? `${peso(total)} spent` : 'Tap to add an expense for this event'}</Muted>
              </View>
            </Card>
          </Pressable>
        );
      })}

      <SectionTitle>Expenses</SectionTitle>
      {expenses.length === 0 && <Muted>No expenses yet. Add the first one, like printables or snacks.</Muted>}
      {expenses.map((x) => (
        <Pressable
          key={x.id}
          onLongPress={() =>
            Alert.alert(`Delete “${x.name}”?`, `${peso(x.amount_cents)} goes back to the credit limit.`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => deleteExpense(x.id) },
            ])
          }
        >
          <Card style={{ gap: space(2) }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space(3) }}>
              <Text style={[styles.itemTitle, { flexShrink: 1 }]}>{x.name}</Text>
              <Money cents={x.amount_cents} />
            </View>
            <Muted>
              {formatDay(x.spent_at)}
              {eventTitle(x.event_id) ? `, ${eventTitle(x.event_id)}` : ''}
            </Muted>
            <View style={styles.chips}>
              {x.splits.map((s) => (
                <View key={s.member_id} style={styles.shareChip}>
                  <View style={[styles.dot, { backgroundColor: colorOf.get(s.member_id) ?? colors.muted }]} />
                  <Text style={styles.shareText}>
                    {nameOf(s.member_id)} {peso(s.amount_cents)}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        </Pressable>
      ))}
      {expenses.length > 0 && <Muted>Press and hold an expense to delete it.</Muted>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  remaining: { fontSize: 36, fontWeight: '800', color: colors.remaining, letterSpacing: -0.5 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  legendName: { flex: 1, color: colors.ink, fontSize: 14 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  link: { color: colors.remaining, fontWeight: '600', fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: space(2),
    paddingHorizontal: space(3),
  },
  shareChip: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  shareText: { color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
  itemTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  eventCard: { flexDirection: 'row', alignItems: 'center', gap: space(4) },
  dateBlock: {
    width: 52,
    alignItems: 'center',
    borderRadius: radius.control,
    borderWidth: 1.5,
    borderColor: colors.ink,
    paddingVertical: space(1.5),
  },
  dateMonth: { fontSize: 12, color: colors.muted },
  dateDay: { fontSize: 22, fontWeight: '800', color: colors.ink },
});
