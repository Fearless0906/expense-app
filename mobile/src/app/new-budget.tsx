import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { peso, toCents } from '@/lib/money';
import { createGroup, getMyUsername } from '@/lib/repo';
import { useQuery } from '@/lib/useQuery';
import { Button, cx, ErrorText, Field, Muted, Screen } from '@/ui/components';
import { SheetHeader } from '@/ui/SheetHeader';
import { colors } from '@/ui/theme';

/** Common limits, so most people never have to type one. */
const QUICK = [500000, 1000000, 2000000, 5000000];

/** Creates a budget: a name and one shared credit limit. Opens it once saved. */
export default function NewBudget() {
  const me = useQuery(getMyUsername, []);
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const limitRef = useRef<TextInput>(null);
  const cents = toCents(limit);

  async function create() {
    if (saving) return;
    if (!name.trim()) return setError('Give the budget a name, like “Org fair”.');
    if (cents === null) return setError('Enter the credit limit in pesos, like 10000 or 10,000.50.');
    setSaving(true);
    try {
      const id = await createGroup(name.trim(), cents, me);
      router.back(); // slide the sheet away, then open the new budget
      router.push(`/group/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <Screen>
      <SheetHeader title="New budget" />
      <Muted>A budget is one shared credit limit for an activity. Everyone you add sees what's left.</Muted>

      <Field
        label="Name"
        value={name}
        onChangeText={(v) => {
          setName(v);
          setError(undefined);
        }}
        placeholder="Org fair"
        autoCapitalize="sentences"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => limitRef.current?.focus()}
      />

      <View className="gap-3">
        <Field
          ref={limitRef}
          label="Credit limit (₱)"
          value={limit}
          onChangeText={(v) => {
            setLimit(v);
            setError(undefined);
          }}
          placeholder="10,000"
          keyboardType="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={create}
        />
        <View className="flex-row flex-wrap gap-2">
          {QUICK.map((c) => {
            const on = cents === c;
            return (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityLabel={`Set the limit to ${peso(c)}`}
                accessibilityState={{ selected: on }}
                onPress={() => {
                  setLimit(String(c / 100));
                  setError(undefined);
                }}
                hitSlop={4}
                className={cx(
                  'min-h-10 justify-center rounded-full border px-4 active:opacity-70',
                  on ? 'border-primary bg-primary' : 'border-border bg-card',
                )}
              >
                <Text
                  className={cx('text-sm font-semibold', on ? 'text-primary-foreground' : 'text-foreground')}
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {peso(c).replace(/\.00$/, '')}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Muted>You can change it later from the budget.</Muted>
      </View>

      {me ? (
        <View className="flex-row items-center gap-2 rounded-lg bg-remaining-soft px-4 py-3">
          <Ionicons name="person-circle-outline" size={18} color={colors.remaining} />
          <Text className="flex-1 text-sm text-foreground">You'll be added to People automatically, as the owner.</Text>
        </View>
      ) : null}

      <ErrorText>{error}</ErrorText>
      <Button title="Create budget" icon="add" onPress={create} busy={saving} />
    </Screen>
  );
}
