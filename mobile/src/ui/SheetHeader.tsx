import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';

import { colors } from './theme';

/**
 * Top of a form-sheet screen (see `sheet` in app/_layout.tsx): a grab handle, the title and a
 * close button. Sheets have no navigation header on Android, so they draw their own.
 */
export function SheetHeader({ title }: { title: string }) {
  return (
    <>
      <View className="items-center pt-1">
        <View className="h-1 w-10 rounded-full bg-border" />
      </View>
      <View className="flex-row items-center justify-between">
        <Text accessibilityRole="header" className="text-2xl font-extrabold tracking-tight text-foreground">
          {title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-full bg-muted active:opacity-60"
        >
          <Ionicons name="close" size={20} color={colors.ink} />
        </Pressable>
      </View>
    </>
  );
}
