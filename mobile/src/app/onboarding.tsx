import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { ReactNode, useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui/text";
import { peso } from "@/lib/money";
import { setOnboarded } from "@/lib/onboarding";
import { Avatar, Button, CreditGauge, cx, Pill } from "@/ui/components";
import { Logo } from "@/ui/Logo";
import { colors, personColors } from "@/ui/theme";

/** Three short slides shown once, before the first sign-in. The art is built from real UI pieces. */
const SLIDES: { key: string; title: string; body: string; art: ReactNode }[] = [
  {
    key: "limit",
    title: "One credit limit, shared",
    body: "Make a budget for an activity, set its credit limit, and always know how much is left.",
    art: <LimitArt />,
  },
  {
    key: "split",
    title: "Split by who was involved",
    body: "Each expense is shared between the people in it, so everyone sees exactly what they owe.",
    art: <SplitArt />,
  },
  {
    key: "sync",
    title: "Works offline, syncs itself",
    body: "Add expenses anywhere. They sync when you're back online, and the friends you invite see the same budget.",
    art: <SyncArt />,
  },
];

export default function Onboarding() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scroller = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const last = page === SLIDES.length - 1;

  const goTo = (i: number) => {
    scroller.current?.scrollTo({ x: i * width, animated: true });
    setPage(i);
  };
  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));

  async function finish(mode: "register" | "login") {
    await setOnboarded();
    router.replace(mode === 'register' ? '/signup' : '/login');
  }

  return (
    <View
      className="flex-1 bg-background"
      style={{
        paddingTop: insets.top,
        paddingBottom: Math.max(insets.bottom, 16),
      }}
    >
      <View className="flex-row items-center justify-between px-6 py-2">
        <Logo size={32} />
        {!last && (
          <Pressable
            accessibilityRole="button"
            onPress={() => goTo(SLIDES.length - 1)}
            hitSlop={12}
            className="min-h-11 justify-center active:opacity-60"
          >
            <Text className="text-sm font-semibold text-muted-foreground">
              Skip
            </Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        className="flex-1"
      >
        {SLIDES.map((s, i) => (
          <View
            key={s.key}
            style={{ width }}
            className="flex-1 justify-center gap-10 px-6"
            accessibilityElementsHidden={i !== page}
            importantForAccessibility={
              i === page ? "auto" : "no-hide-descendants"
            }
          >
            <View
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
              className="items-center"
            >
              {s.art}
            </View>
            <View className="gap-3">
              <Text
                accessibilityRole="header"
                className="text-3xl font-extrabold tracking-tight text-foreground"
              >
                {s.title}
              </Text>
              <Text className="text-base leading-6 text-muted-foreground">
                {s.body}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View className="gap-5 px-6 pt-4">
        <View
          accessible
          accessibilityLabel={`Page ${page + 1} of ${SLIDES.length}`}
          className="flex-row items-center justify-center gap-2"
        >
          {SLIDES.map((s, i) => (
            <View
              key={s.key}
              className={cx(
                "h-2 rounded-full",
                i === page ? "w-6 bg-primary" : "w-2 bg-line",
              )}
            />
          ))}
        </View>
        {last ? (
          <View className="gap-2">
            <Button
              title="Get started"
              icon="arrow-forward"
              onPress={() => finish("register")}
            />
            <Button
              title="I already have an account"
              variant="ghost"
              onPress={() => finish("login")}
            />
          </View>
        ) : (
          <Button
            title="Next"
            icon="arrow-forward"
            onPress={() => goTo(page + 1)}
          />
        )}
      </View>
    </View>
  );
}

// ---- slide art: decorative mock-ups made from the app's own components ----

function LimitArt() {
  return (
    <View className="w-full max-w-xs gap-4 rounded-3xl bg-primary p-6">
      <Text className="text-sm font-medium text-on-ink-muted">Credit left</Text>
      <Text
        className="text-4xl font-extrabold tracking-tight text-on-ink"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {peso(645000)}
      </Text>
      <CreditGauge
        limit={1000000}
        tone="dark"
        segments={[
          { key: "a", value: 180000, color: personColors[0] },
          { key: "b", value: 110000, color: personColors[1] },
          { key: "c", value: 65000, color: personColors[2] },
        ]}
      />
      <Text className="text-xs font-medium text-on-ink-muted">
        {peso(355000)} spent of {peso(1000000)}
      </Text>
    </View>
  );
}

function SplitArt() {
  const rows = [
    { name: "Ana", share: 16667, color: personColors[0] },
    { name: "Ben", share: 16667, color: personColors[1] },
    { name: "Cris", share: 16666, color: personColors[2] },
  ];
  return (
    <View className="w-full max-w-xs gap-4 rounded-3xl bg-card p-5">
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-foreground">
          Printables
        </Text>
        <Text
          className="text-base font-semibold text-foreground"
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {peso(50000)}
        </Text>
      </View>
      {rows.map((r) => (
        <View key={r.name} className="flex-row items-center gap-3">
          <Avatar name={r.name} color={r.color} size={32} />
          <Text className="flex-1 text-sm font-medium text-foreground">
            {r.name}
          </Text>
          <Text
            className="text-sm text-muted-foreground"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {peso(r.share)}
          </Text>
        </View>
      ))}
      <Pill tone="good" icon="checkmark-circle">
        Adds up to {peso(50000)} exactly
      </Pill>
    </View>
  );
}

function SyncArt() {
  return (
    <View className="w-full max-w-xs items-center gap-5">
      <View className="h-28 w-28 items-center justify-center rounded-full bg-remaining-soft">
        <Ionicons
          name="cloud-done-outline"
          size={52}
          color={colors.remaining}
        />
      </View>
      <View className="w-full gap-2 rounded-3xl bg-card p-5">
        <View className="flex-row items-center gap-3">
          <Ionicons
            name="phone-portrait-outline"
            size={18}
            color={colors.ink}
          />
          <Text className="flex-1 text-sm text-foreground">
            Saved on this phone
          </Text>
          <Pill tone="neutral">Offline</Pill>
        </View>
        <View className="flex-row items-center gap-3">
          <Ionicons name="sync-outline" size={18} color={colors.ink} />
          <Text className="flex-1 text-sm text-foreground">Back online</Text>
          <Pill tone="good" icon="checkmark">
            Synced
          </Pill>
        </View>
        <View className="flex-row items-center gap-3">
          <Avatar name="Ben" color={personColors[1]} size={18} />
          <Text className="flex-1 text-sm text-foreground">
            Ben joined your budget
          </Text>
        </View>
      </View>
    </View>
  );
}
