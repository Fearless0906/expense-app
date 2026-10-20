import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import { peso } from '@/lib/money';
import { useSyncState } from '@/lib/sync';

import { colors, radius, space } from './theme';

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.ink} />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  busy?: boolean;
};

export function Button({ title, onPress, variant = 'primary', disabled, busy }: ButtonProps) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        pressed && { opacity: 0.75 },
        off && { opacity: 0.45 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.ink} />
      ) : (
        <Text style={[styles.buttonText, variant === 'primary' && { color: '#fff' }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, style, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: space(1.5) }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor="#94A39C" {...props} style={[styles.input, style]} />
      {hint ? <Muted>{hint}</Muted> : null}
    </View>
  );
}

export function ErrorText({ children }: { children?: string }) {
  return children ? <Text style={styles.error}>{children}</Text> : null;
}

export function Money({ cents, style }: { cents: number; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.money, style]}>{peso(cents)}</Text>;
}

/**
 * The credit limit as one bar. Each person's share of what was spent is a colored
 * segment; the pale rest of the bar is the credit still left.
 */
export function CreditGauge({
  limit,
  segments,
  height = 18,
}: {
  limit: number;
  segments: { key: string; value: number; color: string }[];
  height?: number;
}) {
  const spent = segments.reduce((a, s) => a + s.value, 0);
  const scale = Math.max(limit, spent, 1);
  const over = spent > limit;
  return (
    <View style={[styles.track, { height }, over && styles.trackOver]}>
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <View key={s.key} style={{ flex: s.value / scale, backgroundColor: s.color }} />
        ))}
      <View style={{ flex: Math.max(0, limit - spent) / scale }} />
    </View>
  );
}

export function SyncBanner() {
  const s = useSyncState();
  let text: string | null = null;
  if (s.status === 'offline') {
    text = s.pending
      ? `Offline. ${s.pending} change${s.pending === 1 ? '' : 's'} saved on this phone will sync when you're back online.`
      : 'Offline. You can keep adding expenses; they sync when you reconnect.';
  } else if (s.status === 'error') {
    text = `Sync stopped: ${s.message}. Your changes are still saved on this phone.`;
  } else if (s.status === 'signed-out' && s.message) {
    text = s.message;
  }
  if (!text) return null;
  return (
    <View style={[styles.banner, s.status === 'error' && { borderColor: colors.over }]}>
      <Text style={styles.bannerText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space(4), gap: space(4), paddingBottom: space(16) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space(4),
    gap: space(3),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space(2) },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.control,
    paddingHorizontal: space(3),
    paddingVertical: space(3),
    fontSize: 16,
    color: colors.ink,
    backgroundColor: '#FAFCFB',
  },
  button: {
    minHeight: 48,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(4),
  },
  buttonPrimary: { backgroundColor: colors.ink },
  buttonSecondary: { borderWidth: 1.5, borderColor: colors.ink },
  buttonGhost: { minHeight: 40 },
  buttonText: { fontSize: 16, fontWeight: '600', color: colors.ink },
  error: { color: colors.over, fontSize: 14 },
  money: { fontVariant: ['tabular-nums'], color: colors.ink, fontSize: 16, fontWeight: '600' },
  track: {
    flexDirection: 'row',
    backgroundColor: colors.track,
    borderRadius: radius.pill,
    overflow: 'hidden',
    gap: 2,
  },
  trackOver: { borderWidth: 2, borderColor: colors.over },
  banner: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#F7F9F8',
    borderRadius: radius.control,
    padding: space(3),
  },
  bannerText: { color: colors.ink, fontSize: 14, lineHeight: 20 },
});
