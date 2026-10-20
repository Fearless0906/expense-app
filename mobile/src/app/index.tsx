import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { getToken, setToken } from '@/lib/api';
import { resetLocalData } from '@/lib/db';
import { peso, toCents } from '@/lib/money';
import { createGroup, listGroups } from '@/lib/repo';
import { useSyncState } from '@/lib/sync';
import { useQuery } from '@/lib/useQuery';
import { Button, Card, CreditGauge, ErrorText, Field, Loading, Muted, Screen, SyncBanner } from '@/ui/components';
import { colors } from '@/ui/theme';

export default function Budgets() {
  const [token, setTok] = useState<string | null>();
  useFocusEffect(
    useCallback(() => {
      getToken().then(setTok);
    }, []),
  );
  const groups = useQuery(listGroups, []);
  const { pending } = useSyncState();
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('');
  const [error, setError] = useState<string>();

  if (token === null) return <Redirect href="/login" />;
  if (token === undefined || !groups) return <Loading />;

  async function create() {
    const cents = toCents(limit);
    if (!name.trim()) return setError('Give the budget a name.');
    if (cents === null) return setError('Enter the credit limit in pesos, like 10000 or 10,000.50.');
    const id = await createGroup(name.trim(), cents);
    setName('');
    setLimit('');
    setError(undefined);
    router.push(`/group/${id}`);
  }

  function signOut() {
    const warning = pending
      ? `${pending} change${pending === 1 ? " hasn't" : "s haven't"} synced yet and will be lost.`
      : 'Your data stays on the server. This phone will be cleared.';
    Alert.alert('Sign out?', warning, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await resetLocalData();
          await setToken(null);
          router.replace('/login');
        },
      },
    ]);
  }

  return (
    <Screen>
      <SyncBanner />

      {groups.length === 0 ? (
        <Muted>No budgets yet. Create one below, for example “Org fair” with a ₱10,000 credit limit.</Muted>
      ) : (
        groups.map((g) => {
          const remaining = g.credit_limit_cents - g.spent_cents;
          return (
            <Pressable key={g.id} onPress={() => router.push(`/group/${g.id}`)}>
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink, flexShrink: 1 }}>{g.name}</Text>
                  <Text
                    style={{
                      fontVariant: ['tabular-nums'],
                      fontWeight: '700',
                      color: remaining < 0 ? colors.over : colors.remaining,
                    }}
                  >
                    {peso(remaining)} left
                  </Text>
                </View>
                <CreditGauge
                  limit={g.credit_limit_cents}
                  segments={[{ key: 'spent', value: g.spent_cents, color: colors.ink }]}
                  height={8}
                />
                <Muted>
                  {peso(g.spent_cents)} spent of {peso(g.credit_limit_cents)}
                </Muted>
              </Card>
            </Pressable>
          );
        })
      )}

      <Card>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink }}>New budget</Text>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Org fair" />
        <Field
          label="Credit limit (₱)"
          value={limit}
          onChangeText={setLimit}
          placeholder="10,000"
          keyboardType="decimal-pad"
        />
        <ErrorText>{error}</ErrorText>
        <Button title="Create budget" onPress={create} />
      </Card>

      <Button title="Sign out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
