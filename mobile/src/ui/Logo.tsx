import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

import { colors } from './theme';

/**
 * Hati's mark: a coin split in two ("hati" means to split), white and mint, on a deep forest
 * tile. The same geometry is drawn into the app icons (mobile/assets, made by
 * scripts/make-icons.py), so change both together.
 */
export function LogoMark({ size = 56 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityElementsHidden importantForAccessibility="no">
      <Rect width={100} height={100} rx={28} fill={colors.ink} />
      {/* Left half of the coin, nudged left; right half nudged right: the split. */}
      <Path d="M46 24 A26 26 0 0 0 46 76 Z" fill={colors.onInk} />
      <Path d="M54 24 A26 26 0 0 1 54 76 Z" fill={colors.onInkGood} />
    </Svg>
  );
}

/** The mark with the name next to it, for headers (intro, sign in). Read as "Hati". */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Hati" className={cn('flex-row items-center gap-2', className)}>
      <LogoMark size={size} />
      <Text className="font-extrabold tracking-tight text-foreground" style={{ fontSize: Math.round(size * 0.62) }}>
        Hati
      </Text>
    </View>
  );
}
