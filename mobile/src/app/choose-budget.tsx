import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { peso } from '@/lib/money';
import { listAllMembers, listGroups } from '@/lib/repo';
import { useQuery } from '@/lib/useQuery';
import { EmptyState, ListCard, Loading, Muted, Row, Screen } from '@/ui/components';
import { colors } from '@/ui/theme';
import { addExpenseIn } from '@/ui/useAddExpense';

/** Sheet opened by the floating + button when there's more than one budget. */
export default function ChooseBudget() {
  const groups = useQuery(listGroups, []);
  const members = useQuery(listAllMembers, []);
  if (!groups || !members) return <Loading />;

  return (
    <Screen>
      <Muted>Pick the budget this expense comes out of.</Muted>
      {groups.length === 0 ? (
        <EmptyState icon="wallet-outline" title="No budgets yet">
          Create a budget first, then add expenses to it.
        </EmptyState>
      ) : (
        <ListCard>
          {groups.map((g, i) => {
            const left = g.credit_limit_cents - g.spent_cents;
            const status = left < 0 ? `Over by ${peso(-left)}` : `${peso(left)} left`;
            return (
              <Pressable
                key={g.id}
                accessibilityRole="button"
                accessibilityLabel={`${g.name}, ${status}`}
                onPress={() => addExpenseIn(g.id, members, 'replace')}
                className="active:bg-muted"
              >
                <Row first={i === 0}>
                  <View className="min-h-11 flex-row items-center gap-3">
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-remaining-soft">
                      <Ionicons name="wallet-outline" size={20} color={colors.remaining} />
                    </View>
                    <View className="flex-1 gap-0.5">
                      <Text className="text-base font-semibold">{g.name}</Text>
                      <Text
                        className={left < 0 ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
                        style={{ fontVariant: ['tabular-nums'] }}
                      >
                        {status}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </View>
                </Row>
              </Pressable>
            );
          })}
        </ListCard>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create a new budget"
        accessibilityHint="Opens the new budget form"
        onPress={() => router.replace('/new-budget')}
        className="min-h-14 flex-row items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-border px-4 py-4 active:bg-muted"
      >
        <Ionicons name="add-circle-outline" size={20} color={colors.ink} />
        <Text className="text-base font-semibold text-foreground">Create a new budget</Text>
      </Pressable>
    </Screen>
  );
}
