import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { getToken } from '@/lib/api';
import { hasOnboarded } from '@/lib/onboarding';
import { Loading } from '@/ui/components';
import { FloatingTabBar } from '@/ui/FloatingTabBar';
import { colors } from '@/ui/theme';

type Gate = 'loading' | 'in' | 'login' | 'onboarding';

export default function TabsLayout() {
  const [gate, setGate] = useState<Gate>('loading');
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    (async () => {
      if (await getToken()) return setGate('in');
      setGate((await hasOnboarded()) ? 'login' : 'onboarding');
    })();
  }, []);

  if (gate === 'onboarding') return <Redirect href="/onboarding" />;
  if (gate === 'login') return <Redirect href="/login" />;
  if (gate === 'loading') return <Loading />;

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        // Switching tabs: the new screen fades in with a slight sideways shift.
        animation: reduceMotion ? 'none' : 'shift',
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="expenses" options={{ title: 'Expenses' }} />
      <Tabs.Screen name="events" options={{ title: 'Events' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
