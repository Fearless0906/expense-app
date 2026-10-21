/**
 * Swipe a row left to reveal a red trash button; tap it to delete. The button grows and fades
 * in with the swipe (Reanimated), and the row springs back if you let go early.
 * Screen readers can't swipe, so callers also give the row a "Delete" accessibility action.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { ReactNode, useRef } from 'react';
import { Pressable, View } from 'react-native';
import ReanimatedSwipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, { Extrapolation, interpolate, SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { colors } from './theme';

const ACTION_WIDTH = 80;

function TrashAction({
  progress,
  label,
  onPress,
}: {
  progress: SharedValue<number>;
  label: string;
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.4, 1], [0, 0.5, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.6, 1], Extrapolation.CLAMP) }],
  }));
  return (
    <View className="items-center justify-center" style={{ width: ACTION_WIDTH }}>
      <Reanimated.View style={style}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          className="h-12 w-12 items-center justify-center rounded-full bg-destructive active:opacity-80"
        >
          <Ionicons name="trash-outline" size={22} color={colors.onInk} />
        </Pressable>
      </Reanimated.View>
    </View>
  );
}

export function SwipeToDelete({
  children,
  onDelete,
  label = 'Delete',
}: {
  children: ReactNode;
  /** Usually opens the confirm dialog; the row closes first so it looks settled behind it. */
  onDelete: () => void;
  label?: string;
}) {
  const ref = useRef<SwipeableMethods>(null);
  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      rightThreshold={ACTION_WIDTH / 2}
      overshootRight={false}
      renderRightActions={(progress) => (
        <TrashAction
          progress={progress}
          label={label}
          onPress={() => {
            ref.current?.close();
            onDelete();
          }}
        />
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}
