/**
 * Hati's building blocks, made from React Native Reusables (src/components/ui).
 * Screens use these, not the raw Reusables parts, so sizing (44pt+ targets, growing inputs),
 * copy and accessibility stay consistent. Colors come from the shadcn variables in global.css.
 */
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  CircleAlert,
  CloudOff,
  LogIn,
  TriangleAlert,
} from "lucide-react-native";
import {
  ComponentProps,
  createContext,
  ReactNode,
  Ref,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  ScrollView,
  TextInput,
  TextInputProps,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar as RnrAvatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button as RnrButton } from "@/components/ui/button";
import { Card as RnrCard } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { peso } from "@/lib/money";
import { useSyncState } from "@/lib/sync";
import { cn } from "@/lib/utils";

import { colors } from "./theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

/** Conditional class names; later classes win on conflicts (tailwind-merge). Same as `cn`. */
export const cx = cn;

const tabular = { fontVariant: ["tabular-nums" as const] };

/** Room kept free under a tab screen's content so the floating tab bar and its + button never cover it. */
export const TAB_BAR_SPACE = 116;

/**
 * Scrolling page. `tab` is for the four tab screens: they have no navigation header, so the
 * page pads for the status bar itself and leaves room for the floating tab bar.
 */
/** Space kept between the focused input and the keyboard, so the next field or button shows too. */
const ABOVE_KEYBOARD = 88;

/** Called by inputs on focus: scrolls the screen so they sit above the keyboard (Android). */
const RevealContext = createContext<() => void>(() => {});
export const useRevealOnFocus = () => useContext(RevealContext);

export function Screen({
  children,
  tab,
}: {
  children: ReactNode;
  tab?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const keyboard = useRef(0);
  const [keyboardSpace, setKeyboardSpace] = useState(0);

  // iOS moves content above the keyboard by itself (automaticallyAdjustKeyboardInsets). Android
  // draws edge to edge, so the keyboard covers the screen instead of shrinking it: there we add
  // room under the content and scroll the focused input up ourselves.
  const reveal = useCallback(() => {
    const view = scroll.current?.getNativeScrollRef();
    const input = TextInput.State.currentlyFocusedInput();
    if (Platform.OS !== "android" || !keyboard.current || !view || !input) return;
    view.measureInWindow((sx, sy, sw, sh) => {
      input.measureInWindow((ix, iy, iw, ih) => {
        const inThisScreen = sh > 0 && ix >= sx && ix < sx + sw && iy + ih > sy && iy < sy + sh;
        if (!inThisScreen) return; // another screen's input (a tab or a screen underneath)
        const visibleBottom = Math.min(sy + sh, window.height - keyboard.current);
        const overlap = iy + ih + ABOVE_KEYBOARD - visibleBottom;
        if (overlap > 0) scroll.current?.scrollTo({ y: scrollY.current + overlap, animated: true });
      });
    });
  }, [window.height]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      keyboard.current = e.endCoordinates.height;
      setKeyboardSpace(e.endCoordinates.height);
      setTimeout(reveal, 60); // after the extra room is laid out
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      keyboard.current = 0;
      setKeyboardSpace(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [reveal]);

  const bottom = tab ? insets.bottom + TAB_BAR_SPACE : 64; // pb-16
  return (
    <RevealContext.Provider value={reveal}>
      <ScrollView
        ref={scroll}
        className="flex-1 bg-background"
        contentContainerClassName="gap-4 px-4 pt-2"
        contentContainerStyle={{
          paddingTop: tab ? insets.top + 12 : undefined,
          // The floating tab bar hides while typing, so the keyboard's room replaces it.
          paddingBottom: keyboardSpace ? keyboardSpace + 24 : bottom,
        }}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={32}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior={tab ? "never" : "automatic"}
      >
        {children}
      </ScrollView>
    </RevealContext.Provider>
  );
}

/** Big page title for tab screens, with an optional action (usually a RoundButton) on the right. */
export function TabHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View className="flex-row items-end justify-between gap-3 pb-1">
      <View className="flex-1 gap-1">
        <Text role="heading" className="text-4xl font-extrabold tracking-tight">
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-sm leading-5 text-muted-foreground">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

/** Round icon-only button, e.g. "+" in a tab header. Always give it a label. */
export function RoundButton({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <RnrButton
      size="icon"
      accessibilityLabel={label}
      onPress={onPress}
      className="h-12 w-12 rounded-full"
    >
      <Ionicons name={icon} size={22} color={colors.onInk} />
    </RnrButton>
  );
}

export function Loading() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator color={colors.ink} />
    </View>
  );
}

/** Reusables Card with Hati's spacing: 24px corners, p-5, gap-3. */
export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <RnrCard className={cn("gap-3 rounded-3xl p-5", className)}>
      {children}
    </RnrCard>
  );
}

/** A card holding a list of rows separated by hairlines. Use <Row> inside. */
export function ListCard({ children }: { children: ReactNode }) {
  return (
    <RnrCard className="gap-0 overflow-hidden rounded-3xl p-0">
      {children}
    </RnrCard>
  );
}

export function Row({
  children,
  first,
}: {
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <View className={cn("px-5 py-4", !first && "border-t border-border")}>
      {children}
    </View>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: string;
  action?: ReactNode;
}) {
  return (
    <View className="mt-3 flex-row items-center justify-between">
      <Text role="heading" className="text-lg font-bold tracking-tight">
        {children}
      </Text>
      {action}
    </View>
  );
}

/** Secondary text, 14/20. Extra classes may override anything (cn merges them). */
export function Muted({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Text className={cn("text-sm leading-5 text-muted-foreground", className)}>
      {children}
    </Text>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  accessibilityHint?: string;
};

/**
 * The text inside any button: one line, tight line height, and on Android no extra font
 * padding, so it sits exactly in the middle of the button.
 */
const centeredLabel = Platform.OS === "android" ? { includeFontPadding: false, textAlignVertical: "center" as const } : undefined;

export function ButtonLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Text
      numberOfLines={1}
      maxFontSizeMultiplier={1.3}
      className={cn("text-center text-base font-semibold leading-5", className)}
      style={centeredLabel}
    >
      {children}
    </Text>
  );
}

/** Reusables Button at a fixed 48pt (44 for ghost / danger): easy to tap, never taller. */
export function Button({
  title,
  onPress,
  variant = "primary",
  icon,
  disabled,
  busy,
  accessibilityHint,
}: ButtonProps) {
  const off = !!(disabled || busy);
  const fg =
    variant === "primary"
      ? colors.onInk
      : variant === "danger"
        ? colors.over
        : colors.ink;
  const rnrVariant = {
    primary: "default",
    secondary: "outline",
    ghost: "ghost",
    danger: "ghost",
  } as const;
  return (
    <RnrButton
      variant={rnrVariant[variant]}
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: off, busy: !!busy }}
      onPress={onPress}
      disabled={off}
      className={cn(
        "rounded-lg px-5 py-0",
        variant === "primary" || variant === "secondary" ? "h-12" : "h-11",
        off && "opacity-40",
      )}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <ButtonLabel className={cn(variant === "danger" && "text-destructive")}>
            {title}
          </ButtonLabel>
        </>
      )}
    </RnrButton>
  );
}

/** A small text button, e.g. "Schedule" next to a section title. 44pt tall including hitSlop. */
export function TextLink({
  title,
  onPress,
  icon,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
}) {
  return (
    <RnrButton
      variant="link"
      onPress={onPress}
      hitSlop={8}
      className="h-auto min-h-8 gap-1 px-0 py-0"
    >
      {icon && <Ionicons name={icon} size={16} color={colors.remaining} />}
      <Text className="text-sm font-semibold text-remaining">{title}</Text>
    </RnrButton>
  );
}

/** Reusables Label + Input. The input grows with the text size instead of a fixed height. */
export function Field({
  label,
  hint,
  className,
  ref,
  ...props
}: TextInputProps & { label: string; hint?: string; ref?: Ref<TextInput> }) {
  const id = useId();
  const reveal = useRevealOnFocus();
  return (
    <View className="gap-2">
      <Label nativeID={id} className="font-semibold">
        {label}
      </Label>
      <Input
        ref={ref}
        aria-labelledby={id}
        accessibilityLabel={label}
        accessibilityHint={hint}
        {...props}
        onFocus={(e) => {
          props.onFocus?.(e);
          setTimeout(reveal, 60); // moving between fields while the keyboard stays open
        }}
        className={cn(
          "h-auto min-h-12 rounded-lg bg-muted px-4 py-3 placeholder:text-placeholder",
          className,
        )}
      />
      {hint ? <Muted>{hint}</Muted> : null}
    </View>
  );
}

/** Reusables Alert (destructive) for a form error: what went wrong and what to type instead. */
export function ErrorText({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <Alert
      variant="destructive"
      icon={CircleAlert}
      accessibilityLiveRegion="polite"
      className="border-destructive/30 bg-over-soft"
    >
      <AlertDescription className="text-destructive">
        {children}
      </AlertDescription>
    </Alert>
  );
}

/** Money in tabular figures. Pass size and color classes, or get text-base text-foreground. */
export function Money({
  cents,
  className,
}: {
  cents: number;
  className?: string;
}) {
  return (
    <Text
      className={cn("text-base font-semibold text-foreground", className)}
      style={tabular}
    >
      {peso(cents)}
    </Text>
  );
}

/** Reusables Badge as a status label, e.g. "₱2,000.00 left after this". */
export function Pill({
  children,
  tone = "neutral",
  icon,
}: {
  children: ReactNode;
  tone?: "good" | "over" | "neutral" | "dark";
  icon?: IconName;
}) {
  const fg = {
    good: colors.remaining,
    over: colors.over,
    neutral: colors.ink,
    dark: colors.onInk,
  }[tone];
  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1.5 self-start px-3 py-1.5",
        tone === "good" && "bg-remaining-soft",
        tone === "over" && "bg-over-soft",
        tone === "dark" && "bg-hero-track",
      )}
    >
      {icon && <Ionicons name={icon} size={14} color={fg} />}
      <Text
        className={cn(
          "text-xs font-semibold",
          tone === "good" && "text-remaining",
          tone === "over" && "text-destructive",
          tone === "neutral" && "text-foreground",
          tone === "dark" && "text-on-ink",
        )}
        style={tabular}
      >
        {Array.isArray(children) ? children.join("") : children}
      </Text>
    </Badge>
  );
}

/** Reusables Avatar: a person's initials on their color. Decorative: always show the name next to it. */
export function Avatar({
  name,
  color,
  size = 32,
  uri,
}: {
  name: string;
  color: string;
  size?: number;
  /** Profile photo URL; initials show while it loads or if there's none. */
  uri?: string;
}) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  return (
    <RnrAvatar
      alt={name}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: size, height: size }}
    >
      {uri ? <AvatarImage source={{ uri }} /> : null}
      <AvatarFallback style={{ backgroundColor: color }}>
        <Text
          className="font-bold text-foreground"
          style={{ fontSize: Math.round(size * 0.4) }}
          maxFontSizeMultiplier={1.2}
        >
          {initials}
        </Text>
      </AvatarFallback>
    </RnrAvatar>
  );
}

/** Round icon on a soft background, used to anchor list rows and empty states. */
export function IconWell({
  name,
  size = 40,
  tone = "neutral",
}: {
  name: IconName;
  size?: number;
  tone?: "neutral" | "good" | "over";
}) {
  return (
    <View
      className={cn(
        "items-center justify-center rounded-full",
        tone === "good" ? "bg-remaining-soft" : tone === "over" ? "bg-over-soft" : "bg-muted",
      )}
      style={{ width: size, height: size }}
    >
      <Ionicons
        name={name}
        size={Math.round(size * 0.5)}
        color={tone === "good" ? colors.remaining : tone === "over" ? colors.over : colors.ink}
      />
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children?: ReactNode;
}) {
  return (
    <Card className="items-center py-8">
      <IconWell name={icon} size={52} tone="good" />
      <Text className="text-center text-base font-semibold">{title}</Text>
      {children ? <Muted className="text-center">{children}</Muted> : null}
    </Card>
  );
}

/**
 * The credit limit as one bar. Each person's share of what was spent is a segment; the rest of
 * the bar is the credit still left. "dark" sits on the hero card, "light" on white cards.
 * (Custom rather than Reusables Progress, which only draws one segment.)
 */
export function CreditGauge({
  limit,
  segments,
  height = 12,
  tone = "light",
}: {
  limit: number;
  segments: { key: string; value: number; color: string }[];
  height?: number;
  tone?: "light" | "dark";
}) {
  const spent = segments.reduce((a, s) => a + s.value, 0);
  const scale = Math.max(limit, spent, 1);
  const over = spent > limit;
  const pct =
    limit > 0
      ? Math.min(100, Math.round((spent / limit) * 100))
      : spent > 0
        ? 100
        : 0;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={over ? "Credit used, over the limit" : "Credit used"}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      className={cn(
        "flex-row gap-0.5 overflow-hidden rounded-full",
        tone === "dark" ? "bg-hero-track" : "bg-track",
      )}
      style={[
        { height },
        over && {
          borderWidth: 2,
          borderColor: tone === "dark" ? colors.onInkOver : colors.over,
        },
      ]}
    >
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <View
            key={s.key}
            style={{ flex: s.value / scale, backgroundColor: s.color }}
          />
        ))}
      <View style={{ flex: Math.max(0, limit - spent) / scale }} />
    </View>
  );
}

/** Reusables Alert for offline / sync problems. Hidden when everything is fine. */
export function SyncBanner() {
  const s = useSyncState();
  let title: string | null = null;
  let body = "";
  let icon = CloudOff;
  if (s.status === "offline") {
    title = "You're offline";
    body = s.pending
      ? `${s.pending} change${s.pending === 1 ? " is" : "s are"} saved on this phone and will sync when you reconnect.`
      : "Keep adding expenses; they sync when you reconnect.";
  } else if (s.status === "error") {
    icon = TriangleAlert;
    title = "Some changes aren't on the server yet";
    body = "They're safe on this phone, and the app keeps retrying.";
  } else if (s.status === "signed-out" && s.message) {
    icon = LogIn;
    title = "Signed out";
    body = s.message;
  }
  if (!title) return null;
  const isError = s.status === "error";
  return (
    <Alert
      icon={icon}
      variant={isError ? "destructive" : "default"}
      accessibilityLiveRegion="polite"
      className={cn(
        "rounded-lg",
        isError && "border-destructive/30 bg-over-soft",
      )}
    >
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className={cn(isError && "text-foreground")}>
        {body}
      </AlertDescription>
    </Alert>
  );
}
