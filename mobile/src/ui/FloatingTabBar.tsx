import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { ComponentProps, Fragment, useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconName } from './components';
import { colors } from './theme';
import { tourTarget } from './Tour';
import { useAddExpense } from './useAddExpense';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Icon per tab route: [selected, not selected]. */
const ICONS: Record<string, [IconName, IconName]> = {
  index: ['home', 'home-outline'],
  expenses: ['receipt', 'receipt-outline'],
  events: ['calendar', 'calendar-outline'],
  profile: ['person-circle', 'person-circle-outline'],
};

/** Inner padding of the bar (p-1.5). The sliding pill is inset by the same amount. */
const PAD = 6;
/** Each icon's slot (w-14 = 56pt wide, 48pt tall) and the space between slots (gap-1). */
const TAB = 56;
const GAP = 4;
/** How far the + button rises above the bar's centre line. */
const RAISE = 18;
/** Width of the middle slot under the + button (w-16), as wide as the button with its ring. */
const ADD_SLOT = 64;
const SPRING = { damping: 20, stiffness: 220, mass: 0.8 };

/**
 * Compact floating tab bar, centered: a white rounded bar that hugs its icons (fixed 56pt
 * slots, not full width), icons only (the user asked
 * for no labels; each tab's name is still its accessibilityLabel). A mint pill slides to the
 * current tab (spring; instant when Reduce Motion is on), and the current tab's icon is filled
 * instead of outlined, so it never relies on color alone.
 * The middle of the bar holds a round + button (add an expense from any tab), raised a little
 * above the bar. It's drawn over an empty middle slot, inside a container tall enough to hold
 * it, because Android ignores taps on parts of a view that stick out of its parent.
 * Tab screens use <Screen tab>, which leaves TAB_BAR_SPACE free under the content.
 */
export function FloatingTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const addExpense = useAddExpense();

  const mid = Math.ceil(state.routes.length / 2); // the + goes after the first half of the tabs
  const x = useSharedValue(0);
  useEffect(() => {
    // Tabs after the middle sit further right, past the + button's slot.
    const target = state.index * (TAB + GAP) + (state.index >= mid ? ADD_SLOT + GAP : 0);
    x.value = reduceMotion ? target : withSpring(target, SPRING);
  }, [state.index, mid, reduceMotion, x]);
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  // On Android the keyboard would push the bar up over the field being typed in.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  if (keyboardOpen) return null;

  return (
    <View
      pointerEvents="box-none"
      className="absolute left-0 right-0 items-center px-4"
      style={{ bottom: Math.max(insets.bottom, 12) + 4, paddingTop: RAISE }}
    >
      <View
        accessibilityRole="tablist"
        className="flex-row gap-1 rounded-full border border-border bg-card p-1.5 shadow-lg shadow-black/10"
      >
        <Animated.View
          pointerEvents="none"
          className="absolute rounded-full bg-remaining-soft"
          style={[{ top: PAD, bottom: PAD, left: PAD, width: TAB }, pillStyle]}
        />
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const label = descriptors[route.key].options.title ?? route.name;
          const [on, off] = ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          return (
            <Fragment key={route.key}>
              {index === mid && <View className="h-12 w-16" />}
              <Pressable
                ref={tourTarget(`tab-${route.name}`)}
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected: focused }}
                onPress={onPress}
                onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                className="h-12 w-14 items-center justify-center rounded-full active:opacity-70"
              >
                <Ionicons name={focused ? on : off} size={24} color={focused ? colors.ink : colors.muted} />
              </Pressable>
            </Fragment>
          );
        })}
      </View>

      {/* Raised + in the middle: the ring in the page color makes it look set into the bar. */}
      <View pointerEvents="box-none" className="absolute left-0 right-0 top-0 items-center">
        <Pressable
          ref={tourTarget('add')}
          accessibilityRole="button"
          accessibilityLabel="Add expense"
          onPress={addExpense}
          className="h-16 w-16 items-center justify-center rounded-full border-4 border-background bg-primary shadow-xl shadow-black/25 active:opacity-80"
        >
          <Ionicons name="add" size={30} color={colors.onInk} />
        </Pressable>
      </View>
    </View>
  );
}
