import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { migrate } from '@/lib/db';
import { startAutoSync } from '@/lib/sync';
import { Loading } from '@/ui/components';
import { colors } from '@/ui/theme';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    migrate()
      .then(() => {
        if (cancelled) return;
        stop = startAutoSync();
        setReady(true);
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.bg }}>
        <Text style={{ color: colors.over }}>Couldn't open the database on this phone: {error}</Text>
      </View>
    );
  }
  if (!ready) return <Loading />;

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTintColor: colors.ink,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Budgets' }} />
        <Stack.Screen name="login" options={{ title: 'Sign in', headerBackVisible: false }} />
        <Stack.Screen name="group/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="group/[id]/new-expense" options={{ title: 'Add expense', presentation: 'modal' }} />
        <Stack.Screen name="group/[id]/new-event" options={{ title: 'Schedule event', presentation: 'modal' }} />
      </Stack>
    </>
  );
}
