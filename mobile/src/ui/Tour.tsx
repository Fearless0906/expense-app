/**
 * Guided tour for new users: each step opens its page (Home, Expenses, Events, Profile), dims
 * the screen, cuts a spotlight around one real control and explains it (Back / Next / Skip).
 *
 * - Mark a control with `ref={tourTarget('id')}` (a View or Pressable; wrap others in a View with
 *   collapsable={false}). A step lists target ids in order of preference; the first one that's
 *   on screen gets the spotlight, and with none the card sits in the middle.
 * - `startTourIfNew(username)` runs it once per account (Home calls it); `startTour()` replays it.
 * - <TourHost /> (root layout) draws it above every screen.
 */
import { Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion, useReducedMotion } from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { getMyUsername } from '@/lib/repo';
import { hasToured, setToured } from '@/lib/tour';

import { Button, IconName, IconWell, TextLink } from './components';

type Step = { route: Href; targets?: string[]; icon: IconName; title: string; body: string };

const STEPS: Step[] = [
  {
    route: '/',
    icon: 'sparkles-outline',
    title: 'Welcome to Hati',
    body: 'Here’s a quick look at where everything is. It takes about half a minute.',
  },
  {
    route: '/',
    targets: ['new-budget'],
    icon: 'wallet-outline',
    title: 'Start with a budget',
    body: 'A budget is one shared credit limit, like ₱10,000 for an org fair. Create one here, then add the people in it.',
  },
  {
    route: '/',
    targets: ['add'],
    icon: 'add-circle-outline',
    title: 'Add an expense',
    body: 'Tap + from any page. Enter what was bought, and Hati splits it between the people involved.',
  },
  {
    route: '/',
    targets: ['bell'],
    icon: 'notifications-outline',
    title: 'Invitations and reminders',
    body: 'When someone adds you to their budget, the invitation shows up here.',
  },
  {
    route: '/expenses',
    targets: ['expenses-summary', 'tab-expenses'],
    icon: 'receipt-outline',
    title: 'Expenses',
    body: 'Every expense, newest first, with what was spent and your share. Swipe one left to delete it.',
  },
  {
    route: '/events',
    targets: ['new-event', 'tab-events'],
    icon: 'calendar-outline',
    title: 'Events',
    body: 'Your own schedule, like meetings or a thesis defense. Add one with New event.',
  },
  {
    route: '/profile',
    targets: ['profile-photo', 'tab-profile'],
    icon: 'person-circle-outline',
    title: 'Your profile',
    body: 'Tap your photo to change it. Here you also set your email and password and see what you owe.',
  },
  {
    route: '/',
    icon: 'checkmark-circle-outline',
    title: 'You’re all set',
    body: 'Create your first budget to get started. You can replay this tour from Profile.',
  },
];

// ---- targets ----

const targets = new Map<string, View>();

/** Ref callback that lets the tour find this control on screen. */
export function tourTarget(id: string) {
  return (view: View | null) => {
    if (view) targets.set(id, view);
    else targets.delete(id);
  };
}

// ---- starting ----

let show: (() => void) | null = null;
let running = false; // a second start while it's open would jump back to step 1

/** Runs the tour now (e.g. "Show the app tour" in Profile). */
export function startTour() {
  show?.();
}

/** Runs the tour if this account hasn't seen it on this phone yet (Home calls it). */
export async function startTourIfNew(username: string | null) {
  if (!running && !(await hasToured(username))) startTour();
}

// ---- overlay ----

type Rect = { x: number; y: number; w: number; h: number };
const PAD = 8; // space between the control and the spotlight's edge

/**
 * Where the first visible target is, relative to `root` (the overlay). Measuring both in window
 * coordinates and subtracting cancels any offset the platform adds (e.g. the Android status bar).
 */
function locate(root: View, ids: string[], done: (spot: Rect | null) => void) {
  root.measureInWindow((ox, oy, ow, oh) => {
    const attempt = (k: number) => {
      const view = k < ids.length ? targets.get(ids[k]) : undefined;
      if (k >= ids.length) return done(null);
      if (!view) return attempt(k + 1);
      view.measureInWindow((x, y, w, h) => {
        const left = x - ox;
        const top = y - oy;
        const onScreen = w > 0 && h > 0 && left >= 0 && top >= 0 && left + w <= ow + 1 && top + h <= oh + 1;
        if (onScreen) done({ x: left - PAD, y: top - PAD, w: w + PAD * 2, h: h + PAD * 2 });
        else attempt(k + 1);
      });
    };
    attempt(0);
  });
}

export function TourHost() {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  // undefined while measuring (card hidden, so it doesn't jump), null = no spotlight.
  const [spot, setSpot] = useState<Rect | null | undefined>(undefined);
  const [height, setHeight] = useState(0);
  const root = useRef<View>(null);
  const reduceMotion = useReducedMotion();
  const fade = (ms: number) => FadeIn.duration(ms).reduceMotion(ReduceMotion.System);

  useEffect(() => {
    show = () => {
      setIndex(0);
      setActive(true);
    };
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    running = active;
  }, [active]);

  function finish() {
    setActive(false);
    void getMyUsername().then(setToured);
  }

  // Each step: open its page, wait for the page transition, then find the control.
  const step = STEPS[index];
  useEffect(() => {
    if (!active) return;
    setSpot(undefined);
    router.navigate(step.route);
    let cancelled = false;
    const timer = setTimeout(
      () => {
        const ids = step.targets ?? [];
        if (!root.current || ids.length === 0) return setSpot(null);
        locate(root.current, ids, (found) => !cancelled && setSpot(found));
      },
      reduceMotion ? 120 : 420, // tabs slide ('shift') for about 300ms
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, index, step, reduceMotion]);

  // Android back button: leave the tour, not the screen behind it.
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      finish();
      return true;
    });
    return () => sub.remove();
  }, [active]);

  if (!active) return null;

  const last = index === STEPS.length - 1;
  // The card goes below a spotlight in the top half of the screen, above one in the bottom half.
  const below = spot ? spot.y + spot.h / 2 < height / 2 : false;
  const cardPlace = !spot
    ? { top: 0, bottom: 0, justifyContent: 'center' as const }
    : below
      ? { top: spot.y + spot.h + 12 }
      : { bottom: height - spot.y + 12 };

  return (
    <Animated.View
      entering={fade(200)}
      exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}
      className="absolute bottom-0 left-0 right-0 top-0"
      style={{ zIndex: 100, elevation: 100 }}
      accessibilityViewIsModal
    >
      {/* Measuring reference: fills the overlay exactly. */}
      <View
        ref={root}
        collapsable={false}
        pointerEvents="none"
        className="absolute bottom-0 left-0 right-0 top-0"
        onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      />

      {/* The dim layer, in four pieces around the spotlight so the control shows through. */}
      {spot ? (
        <>
          <View className="absolute left-0 right-0 top-0 bg-black/60" style={{ height: Math.max(0, spot.y) }} />
          <View className="absolute bottom-0 left-0 right-0 bg-black/60" style={{ top: spot.y + spot.h }} />
          <View className="absolute left-0 bg-black/60" style={{ top: spot.y, height: spot.h, width: Math.max(0, spot.x) }} />
          <View className="absolute right-0 bg-black/60" style={{ top: spot.y, height: spot.h, left: spot.x + spot.w }} />
          <Animated.View
            key={`ring-${index}`}
            entering={fade(250)}
            pointerEvents="none"
            className="absolute rounded-2xl border-2 border-on-ink-good"
            style={{ left: spot.x, top: spot.y, width: spot.w, height: spot.h }}
          />
        </>
      ) : (
        <View className="absolute bottom-0 left-0 right-0 top-0 bg-black/60" />
      )}

      {spot !== undefined && (
        <View pointerEvents="box-none" className="absolute left-4 right-4" style={cardPlace}>
          <Animated.View key={index} entering={fade(220)} className="gap-3 rounded-3xl bg-card p-5 shadow-xl shadow-black/30">
            <View className="flex-row items-center justify-between">
              <IconWell name={step.icon} size={40} tone="good" />
              {!last && <TextLink title="Skip tour" onPress={finish} />}
            </View>
            <View className="gap-1" accessible accessibilityLiveRegion="polite">
              <Text className="text-xs font-semibold text-muted-foreground">
                Step {index + 1} of {STEPS.length}
              </Text>
              <Text accessibilityRole="header" className="text-xl font-bold tracking-tight text-foreground">
                {step.title}
              </Text>
              <Text className="text-base leading-6 text-muted-foreground">{step.body}</Text>
            </View>
            {/* Progress dots: the current one is wider, so it isn't shown by color alone. */}
            <View className="flex-row gap-1.5" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              {STEPS.map((_, i) => (
                <View
                  key={i}
                  className={i === index ? 'h-1.5 w-5 rounded-full bg-primary' : 'h-1.5 w-1.5 rounded-full bg-track'}
                />
              ))}
            </View>
            <View className="flex-row gap-3">
              {index > 0 && (
                <View className="flex-1">
                  <Button title="Back" variant="secondary" onPress={() => setIndex(index - 1)} />
                </View>
              )}
              <View className="flex-1">
                <Button
                  title={last ? 'Let’s go' : index === 0 ? 'Show me' : 'Next'}
                  icon={last ? 'checkmark' : 'arrow-forward'}
                  onPress={() => (last ? finish() : setIndex(index + 1))}
                />
              </View>
            </View>
          </Animated.View>
        </View>
      )}
    </Animated.View>
  );
}
