import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { peso, toCents } from '@/lib/money';
import { addExpense, getGroup, listEvents, listExpenses, listMembers, summarize } from '@/lib/repo';
import { splitAmount } from '@/lib/split';
import { useQuery } from '@/lib/useQuery';
import { Button, Card, ErrorText, Field, Loading, Muted, Screen, SectionTitle } from '@/ui/components';
import { colors, personColors, radius, space } from '@/ui/theme';

export default function NewExpense() {
  const { id, eventId } = useLocalSearchParams<{ id: string; eventId?: string }>();
  const group = useQuery(() => getGroup(id), [id]);
  const members = useQuery(() => listMembers(id), [id]);
  const events = useQuery(() => listEvents(id), [id]);
  const expenses = useQuery(() => listExpenses(id), [id]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [chosenEvent, setChosenEvent] = useState<string | null>(eventId ?? null);
  const [weightsDraft, setWeights] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  if (!group || !members || !events || !expenses) return <Loading />;

  const colorOf = new Map(members.map((m, i) => [m.id, personColors[i % personColors.length]]));
  const active = members.filter((m) => !m.deleted);
  // Everyone starts included with an equal share. Tap a name to leave them out.
  const weights = weightsDraft ?? Object.fromEntries(active.map((m) => [m.id, 1]));
  const setWeight = (memberId: string, w: number) => setWeights({ ...weights, [memberId]: Math.max(0, Math.min(9, w)) });

  const amountCents = toCents(amount);
  const people = active.filter((m) => (weights[m.id] ?? 0) > 0).map((m) => ({ memberId: m.id, weight: weights[m.id] }));
  const shares = amountCents !== null && people.length > 0 ? splitAmount(amountCents, people.map((p) => p.weight)) : null;
  const shareOf = new Map(people.map((p, i) => [p.memberId, shares?.[i]]));
  const remainingNow = summarize(group, expenses).remaining;
  const remainingAfter = remainingNow - (amountCents ?? 0);

  async function save() {
    if (!name.trim()) return setError('Name the expense, like “Printables”.');
    if (amountCents === null || amountCents === 0) return setError('Enter the amount in pesos, like 500.');
    if (people.length === 0) return setError('Pick at least one person who was involved.');
    const doSave = async () => {
      setSaving(true);
      try {
        await addExpense({ groupId: id, eventId: chosenEvent, name: name.trim(), amountCents, spentAt: new Date(), people });
        router.back();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setSaving(false);
      }
    };
    if (remainingAfter < 0) {
      Alert.alert('Over the credit limit', `This puts the budget ${peso(-remainingAfter)} over its limit. Save anyway?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save anyway', onPress: doSave },
      ]);
    } else {
      await doSave();
    }
  }

  return (
    <Screen>
      <Field label="What was it for?" value={name} onChangeText={setName} placeholder="Printables" autoFocus />
      <Field label="Amount (₱)" value={amount} onChangeText={setAmount} placeholder="500" keyboardType="decimal-pad" />
      <Muted style={remainingAfter < 0 ? { color: colors.over } : undefined}>
        {remainingAfter < 0
          ? `${peso(-remainingAfter)} over the credit limit after this`
          : `${peso(remainingAfter)} of credit left after this`}
      </Muted>

      <SectionTitle>Who was involved?</SectionTitle>
      <Muted>Tap a name to include or leave out. Use + if someone used more: 2× pays twice the share.</Muted>
      <Card style={{ gap: 0, paddingVertical: space(1) }}>
        {active.map((m, i) => {
          const w = weights[m.id] ?? 0;
          const included = w > 0;
          return (
            <View key={m.id} style={[styles.personRow, i > 0 && styles.divider]}>
              <Pressable
                onPress={() => setWeight(m.id, included ? 0 : 1)}
                style={styles.personTap}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: included }}
              >
                <View style={[styles.check, included && { backgroundColor: colorOf.get(m.id), borderColor: colorOf.get(m.id) }]}>
                  {included && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.personName, !included && { color: colors.muted }]}>{m.name}</Text>
                  {included && shareOf.get(m.id) !== undefined && (
                    <Text style={styles.share}>{peso(shareOf.get(m.id)!)}</Text>
                  )}
                </View>
              </Pressable>
              {included && (
                <View style={styles.stepper}>
                  <Pressable onPress={() => setWeight(m.id, w - 1)} style={styles.stepBtn} hitSlop={6}>
                    <Text style={styles.stepText}>−</Text>
                  </Pressable>
                  <Text style={styles.weight}>{w}×</Text>
                  <Pressable onPress={() => setWeight(m.id, w + 1)} style={styles.stepBtn} hitSlop={6}>
                    <Text style={styles.stepText}>+</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </Card>

      {events.length > 0 && (
        <>
          <SectionTitle>Event</SectionTitle>
          <View style={styles.chips}>
            {[{ id: null, title: 'No event' }, ...events].map((e) => {
              const on = chosenEvent === e.id;
              return (
                <Pressable key={e.id ?? 'none'} onPress={() => setChosenEvent(e.id)} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={{ color: on ? '#fff' : colors.ink }}>{e.title}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <ErrorText>{error}</ErrorText>
      <Button title="Save expense" onPress={save} busy={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  personRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space(3), gap: space(3) },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  personTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: 40 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personName: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  share: { color: colors.muted, fontVariant: ['tabular-nums'], marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 20, color: colors.ink },
  weight: { minWidth: 28, textAlign: 'center', fontVariant: ['tabular-nums'], color: colors.ink, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: space(2),
    paddingHorizontal: space(3),
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
});
