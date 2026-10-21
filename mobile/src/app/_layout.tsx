import '../../global.css';

import Ionicons from '@expo/vector-icons/Ionicons';
import { PortalHost } from '@rn-primitives/portal';
import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { migrate } from '@/lib/db';
import { NAV_THEME } from '@/lib/theme';
import { startAutoSync } from '@/lib/sync';
import { Loading } from '@/ui/components';
import { DialogHost } from '@/ui/dialog';
import { TourHost } from '@/ui/Tour';
import { colors } from '@/ui/theme';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const reduceMotion = useReducedMotion();

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
      <View className="flex-1 justify-center gap-3 bg-background p-6">
        <Ionicons name="warning-outline" size={28} color={colors.over} />
        <Text className="text-lg font-bold text-foreground">Couldn't open the data on this phone</Text>
        <Text className="text-sm leading-5 text-muted-foreground">{error}</Text>
      </View>
    );
  }
  if (!ready) return <Loading />;

  // Sign-in, intro and home swap with a fade; creation forms rise from the bottom.
  const fade = reduceMotion ? 'none' : 'fade';
  const modal = { presentation: 'modal', animation: reduceMotion ? 'none' : 'slide_from_bottom' } as const;
  // Short forms open as a native sheet; the screen draws its own header (<SheetHeader>),
  // because Android sheets don't render the navigation header.
  const sheet = {
    presentation: 'formSheet',
    sheetAllowedDetents: [0.8, 1] as number[],
    sheetInitialDetentIndex: 0,
    sheetCornerRadius: 20,
    headerShown: false,
    contentStyle: { backgroundColor: colors.bg },
  } as const;

  return (
    // Swipe-to-delete rows need the gesture handler root around the whole app.
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ThemeProvider value={NAV_THEME.light}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTintColor: colors.ink,
          headerTitleStyle: { fontWeight: '700' },
          headerLargeTitleShadowVisible: false,
          headerLargeTitleStyle: { color: colors.ink, fontWeight: '800' },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.bg },
          // Pushed screens slide in from the right on both platforms (iOS-style on Android too).
          animation: reduceMotion ? 'none' : 'ios_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home', animation: fade }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false, animation: fade }} />
        <Stack.Screen
          name="login"
          options={{ title: '', headerBackVisible: false, gestureEnabled: false, animation: fade }}
        />
        <Stack.Screen name="signup" options={{ title: '', headerBackVisible: false, gestureEnabled: false, animation: fade }} />
        <Stack.Screen name="forgot-password" options={{ title: '' }} />
        <Stack.Screen name="reset-password" options={{ title: '' }} />
        <Stack.Screen name="change-password" options={{ title: 'Change password' }} />
        <Stack.Screen name="privacy" options={{ title: 'What others can see' }} />
        <Stack.Screen name="group/[id]/index" options={{ title: '', headerLargeTitle: true }} />
        <Stack.Screen name="group/[id]/new-expense" options={{ title: 'New expense', ...modal }} />
        <Stack.Screen name="group/[id]/new-person" options={{ title: 'Add person', ...modal }} />
        {/* Sheets, not full screens: rounded top, drag down (or tap ✕) to close. */}
        <Stack.Screen name="new-budget" options={{ title: 'New budget', ...sheet }} />
        <Stack.Screen name="new-event" options={{ title: 'New event', ...sheet }} />
        <Stack.Screen name="choose-budget" options={{ title: 'Add to which budget?', ...modal }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="group/[id]/person/[memberId]" options={{ title: '' }} />
        <Stack.Screen name="group/[id]/expense/[expenseId]" options={{ title: '' }} />
      </Stack>
      {/* React Native Reusables draws dialogs, popovers and menus here, above every screen. */}
      <TourHost />
      <DialogHost />
      <PortalHost />
    </ThemeProvider>
    </GestureHandlerRootView>
  );
}
