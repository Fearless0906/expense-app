import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDay, formatTime } from '@/lib/money';
import { addEvent } from '@/lib/repo';
import { Button, ErrorText, Field, Screen } from '@/ui/components';
import { colors, radius, space } from '@/ui/theme';

function nextHour() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}

export default function NewEvent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState(nextHour);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const [error, setError] = useState<string>();

  function onPicked(picked: Date) {
    const d = new Date(startsAt);
    if (picker === 'date') d.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
    else d.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    setStartsAt(d);
    if (Platform.OS === 'android') setPicker(null); // Android shows a dialog that closes itself
  }

  async function save() {
    if (!title.trim()) return setError('Name the event, like “Booth setup”.');
    await addEvent({
      group_id: id,
      title: title.trim(),
      starts_at: startsAt.toISOString(),
      ends_at: null,
      location: location.trim(),
      notes: notes.trim(),
    });
    router.back();
  }

  const iso = startsAt.toISOString();
  return (
    <Screen>
      <Field label="Event" value={title} onChangeText={setTitle} placeholder="Booth setup" autoFocus />

      <View style={{ flexDirection: 'row', gap: space(3) }}>
        <Pressable style={[styles.when, picker === 'date' && styles.whenOn]} onPress={() => setPicker('date')}>
          <Text style={styles.whenLabel}>Date</Text>
          <Text style={styles.whenValue}>{formatDay(iso)}</Text>
        </Pressable>
        <Pressable style={[styles.when, picker === 'time' && styles.whenOn]} onPress={() => setPicker('time')}>
          <Text style={styles.whenLabel}>Time</Text>
          <Text style={styles.whenValue}>{formatTime(iso)}</Text>
        </Pressable>
      </View>

      {picker && (
        <View>
          <DateTimePicker
            value={startsAt}
            mode={picker}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onValueChange={(_, date) => onPicked(date)}
            onDismiss={() => setPicker(null)}
          />
          {Platform.OS === 'ios' && <Button title="Done" variant="secondary" onPress={() => setPicker(null)} />}
        </View>
      )}

      <Field label="Location (optional)" value={location} onChangeText={setLocation} placeholder="Gym, 2nd floor" />
      <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline style={{ minHeight: 80 }} />
      <ErrorText>{error}</ErrorText>
      <Button title="Save event" onPress={save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  when: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    padding: space(3),
    gap: 2,
  },
  whenOn: { borderColor: colors.ink, borderWidth: 1.5 },
  whenLabel: { color: colors.muted, fontSize: 13 },
  whenValue: { color: colors.ink, fontSize: 16, fontWeight: '600' },
});
