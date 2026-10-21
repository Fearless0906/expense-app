import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';

import { colors } from './theme';
import { useNotifications } from './useNotifications';

/** Bell in Home's header. The red badge counts what needs attention; tap for the list. */
export function NotificationBell() {
  const { count } = useNotifications();
  const label = count ? `Notifications, ${count} new` : 'Notifications';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push('/notifications')}
      hitSlop={4}
      className="h-12 w-12 items-center justify-center rounded-full border border-border bg-card active:opacity-70"
    >
      <Ionicons name={count ? 'notifications' : 'notifications-outline'} size={22} color={colors.ink} />
      {count > 0 && (
        <View
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          className="absolute -right-0.5 -top-0.5 h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-destructive px-1"
        >
          <Text className="text-[10px] font-bold leading-3 text-destructive-foreground" maxFontSizeMultiplier={1}>
            {count > 9 ? '9+' : count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
