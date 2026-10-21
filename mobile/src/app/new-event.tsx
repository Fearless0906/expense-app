import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { formatDay, formatTime } from '@/lib/money';
import { addEvent } from '@/lib/repo';
import { Button, cx, ErrorText, Field, IconName, Screen } from '@/ui/components';
import { SheetHeader } from '@/ui/SheetHeader';
import { colors } from '@/ui/theme';

function nextHour() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}

/** New event. Events are personal and separate from budgets and expenses. */
export default function NewEvent() {
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState(nextHour);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  function onPicked(picked: Date) {
    const d = new Date(startsAt);
    if (picker === 'date') d.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
    else d.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    setStartsAt(d);
    if (Platform.OS === 'android') setPicker(null); // Android shows a dialog that closes itself
  }

  async function save() {
    if (saving) return;
    if (!title.trim()) return setError('Name the event, like “Booth setup”.');
    setSaving(true);
    try {
      await addEvent({
        title: title.trim(),
        starts_at: startsAt.toISOString(),
        ends_at: null,
        location: location.trim(),
        notes: notes.trim(),
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  const iso = startsAt.toISOString();
  const tile = (kind: 'date' | 'time', icon: IconName, label: string, value: string) => {
    const on = picker === kind;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value}`}
        accessibilityHint={`Opens a ${kind} picker`}
        accessibilityState={{ expanded: on }}
        onPress={() => setPicker(on ? null : kind)}
        className={cx(
          'flex-1 gap-1 rounded-lg border bg-card p-4 active:opacity-70',
          on ? 'border-primary' : 'border-border',
        )}
      >
        <View className="flex-row items-center gap-1.5">
          <Ionicons name={icon} size={14} color={colors.muted} />
          <Text className="text-xs font-medium text-muted-foreground">{label}</Text>
        </View>
        <Text className="text-base font-semibold text-foreground">{value}</Text>
      </Pressable>
    );
  };

  return (
    <Screen>
      <SheetHeader title="New event" />
      <Field label="Event" value={title} onChangeText={setTitle} placeholder="Booth setup" />

      <View className="flex-row gap-3">
        {tile('date', 'calendar-outline', 'Date', formatDay(iso))}
        {tile('time', 'time-outline', 'Time', formatTime(iso))}
      </View>

      {picker && (
        <View>
          <DateTimePicker
            value={startsAt}
            mode={picker}
            display={Platform.OS === 'ios' ? (picker === 'date' ? 'inline' : 'spinner') : 'default'}
            onValueChange={(_, date) => onPicked(date)}
            onDismiss={() => setPicker(null)}
          />
          {Platform.OS === 'ios' && <Button title="Done" variant="secondary" onPress={() => setPicker(null)} />}
        </View>
      )}

      <Field label="Location (optional)" value={location} onChangeText={setLocation} placeholder="Gym, 2nd floor" />
      <Field
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        placeholder="What to bring, who's in charge…"
        multiline
        textAlignVertical="top"
        className="min-h-24"
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Save event" icon="checkmark" onPress={save} busy={saving} />
    </Screen>
  );
}
