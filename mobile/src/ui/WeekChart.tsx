import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { formatDay, peso } from '@/lib/money';
import { Expense } from '@/lib/repo';

import { Card, cx, Money } from './components';
import { colors } from './theme';

const PLOT_HEIGHT = 112;
const dayKey = (d: Date) => d.toDateString();

/**
 * Spending per day for the last 7 days: one series, so no legend; the title names it.
 * Bars sit on a shared baseline with 4px rounded tops, all in one color (no fading: the
 * tapped day is marked by its bold label and the readout). Tap a bar to read its value,
 * the touch version of a hover tooltip. Every bar is also labeled for screen readers.
 */
export function WeekChart({ expenses }: { expenses: Expense[] }) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return d;
  });
  const totals = new Map<string, number>();
  for (const x of expenses) {
    const k = dayKey(new Date(x.spent_at));
    totals.set(k, (totals.get(k) ?? 0) + x.amount_cents);
  }
  const values = days.map((d) => totals.get(dayKey(d)) ?? 0);
  const week = values.reduce((a, v) => a + v, 0);

  // The 7 days before this window, for the comparison line.
  const start = new Date(days[0]);
  start.setHours(0, 0, 0, 0);
  const prevStart = new Date(start);
  prevStart.setDate(start.getDate() - 7);
  const lastWeek = expenses
    .filter((x) => {
      const t = new Date(x.spent_at);
      return t >= prevStart && t < start;
    })
    .reduce((a, x) => a + x.amount_cents, 0);
  const diff = week - lastWeek;

  const [selected, setSelected] = useState(6); // today
  const max = Math.max(...values, 1);
  const sel = days[selected];

  return (
    <Card>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text accessibilityRole="header" className="text-sm font-medium text-muted-foreground">
            Spent in the last 7 days
          </Text>
          <Money cents={week} className="text-2xl font-extrabold tracking-tight text-foreground" />
        </View>
        {(week > 0 || lastWeek > 0) && (
          <View className="flex-row items-center gap-1 pt-1">
            <Ionicons
              name={diff > 0 ? 'trending-up' : diff < 0 ? 'trending-down' : 'remove'}
              size={16}
              color={colors.muted}
            />
            <Text className="text-xs font-medium text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>
              {diff === 0 ? 'Same as the week before' : `${peso(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than the week before`}
            </Text>
          </View>
        )}
      </View>

      {/* Readout for the tapped bar */}
      <Text accessibilityLiveRegion="polite" className="text-xs text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>
        {selected === 6 ? 'Today' : formatDay(sel.toISOString())}: {peso(values[selected])}
      </Text>

      <View>
        <View className="flex-row items-end gap-2" style={{ height: PLOT_HEIGHT }}>
          {values.map((v, i) => {
            const on = i === selected;
            const h = v > 0 ? Math.max(6, Math.round((v / max) * PLOT_HEIGHT)) : 2;
            const name = days[i].toLocaleDateString('en-PH', { weekday: 'long' });
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`${i === 6 ? 'Today' : name}, ${peso(v)}`}
                accessibilityState={{ selected: on }}
                onPress={() => setSelected(i)}
                className="h-full flex-1 items-center justify-end"
              >
                <View
                  className={cx('w-full max-w-7', v > 0 ? 'bg-remaining' : 'bg-track')}
                  style={{ height: h, borderTopLeftRadius: 4, borderTopRightRadius: 4 }}
                />
              </Pressable>
            );
          })}
        </View>
        <View className="border-t border-border" />
        <View className="mt-2 flex-row gap-2">
          {days.map((d, i) => (
            <Text
              key={i}
              className={cx('flex-1 text-center text-xs', i === selected ? 'font-semibold text-foreground' : 'text-muted-foreground')}
            >
              {d.toLocaleDateString('en-PH', { weekday: 'short' })}
            </Text>
          ))}
        </View>
      </View>
      {week === 0 && <Text className="text-sm leading-5 text-muted-foreground">No spending in the last 7 days.</Text>}
    </Card>
  );
}
