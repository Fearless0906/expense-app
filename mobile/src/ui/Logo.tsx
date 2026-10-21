import { Image, View } from 'react-native';

import { cn } from '@/lib/utils';

/*
 * Hati's logo: a circle split into three shares (ink, green, gold). The images are cut out of
 * mobile/assets/app-icon.png and primary-logo.png by mobile/scripts/make-icons.py, which also
 * makes the app icons; replace those two PNGs and rerun the script to change the logo everywhere.
 */
const WORDMARK = require('../../assets/logo-wordmark.png');
const WORDMARK_RATIO = 399 / 144; // width / height of logo-wordmark.png

/** The mark with "Hati" next to it, `size` tall, for headers. Read as "Hati". */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Hati" className={cn('self-start', className)}>
      <Image source={WORDMARK} style={{ height: size, width: size * WORDMARK_RATIO }} resizeMode="contain" />
    </View>
  );
}
