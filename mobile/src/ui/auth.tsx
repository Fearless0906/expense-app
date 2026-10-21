/** Building blocks for the sign-in, sign-up and password screens. */
import Ionicons from '@expo/vector-icons/Ionicons';
import { ReactNode, Ref, useId, useRef, useState } from 'react';
import { Pressable, TextInput, TextInputProps, View } from 'react-native';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { passwordChecks } from '@/lib/auth';

import { Card, cx, Muted, Screen, useRevealOnFocus } from './components';
import { Logo } from './Logo';
import { colors } from './theme';

/** Brand mark, big title and subtitle, then the form in a card, then the footer links. */
export function AuthScreen({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Screen>
      <View className="gap-5 pb-1 pt-4">
        <Logo size={44} />
        <View className="gap-2">
          <Text role="heading" className="text-3xl font-extrabold tracking-tight">
            {title}
          </Text>
          <Text className="text-base leading-6 text-muted-foreground">{subtitle}</Text>
        </View>
      </View>
      <Card className="gap-4">{children}</Card>
      {footer}
    </Screen>
  );
}

/** "New to Hati? Create an account": muted text plus a link, centered. */
export function AuthFooterLink({ text, link, onPress }: { text: string; link: string; onPress: () => void }) {
  return (
    <View className="flex-row flex-wrap items-center justify-center gap-1 pt-2">
      <Muted>{text}</Muted>
      <Pressable accessibilityRole="button" onPress={onPress} hitSlop={10} className="min-h-11 justify-center active:opacity-60">
        <Text className="text-sm font-semibold text-remaining">{link}</Text>
      </Pressable>
    </View>
  );
}

/** Password input with a show / hide eye. */
export function PasswordField({
  label,
  ref,
  ...props
}: TextInputProps & { label: string; ref?: Ref<TextInput> }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const reveal = useRevealOnFocus();
  return (
    <View className="gap-2">
      <Label nativeID={id} className="font-semibold">
        {label}
      </Label>
      <View className="justify-center">
        <Input
          ref={ref}
          aria-labelledby={id}
          accessibilityLabel={label}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          {...props}
          onFocus={(e) => {
            props.onFocus?.(e);
            setTimeout(reveal, 60);
          }}
          className="h-auto min-h-12 rounded-lg bg-muted py-3 pl-4 pr-14 placeholder:text-placeholder"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          onPress={() => setVisible(!visible)}
          hitSlop={6}
          className="absolute right-1 h-11 w-11 items-center justify-center rounded-full active:opacity-60"
        >
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

/** Live checklist of the password rules (the server checks them too). */
export function PasswordRules({ password, username }: { password: string; username?: string }) {
  return (
    <View accessibilityLiveRegion="polite" className="gap-1.5">
      {passwordChecks(password, username).map((c) => (
        <View key={c.label} className="flex-row items-center gap-2">
          <Ionicons
            name={c.ok ? 'checkmark-circle' : 'ellipse-outline'}
            size={16}
            color={c.ok ? colors.remaining : colors.muted}
          />
          <Text
            accessibilityLabel={`${c.label}, ${c.ok ? 'done' : 'not yet'}`}
            className={cx('text-sm', c.ok ? 'text-foreground' : 'text-muted-foreground')}
          >
            {c.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Six boxes for an emailed code. One hidden TextInput does the typing (so paste and the
 * keyboard's one-time-code suggestion work); the boxes just show the digits.
 */
export function CodeInput({
  value,
  onChange,
  length = 6,
  autoFocus,
}: {
  value: string;
  onChange: (code: string) => void;
  length?: number;
  autoFocus?: boolean;
}) {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const reveal = useRevealOnFocus();
  const activeBox = Math.min(value.length, length - 1);
  return (
    <View className="gap-2">
      <Label className="font-semibold">Code</Label>
      <Pressable onPress={() => input.current?.focus()} importantForAccessibility="no">
        <View className="flex-row gap-2" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {Array.from({ length }, (_, i) => (
            <View
              key={i}
              className={cx(
                'h-14 flex-1 items-center justify-center rounded-lg bg-muted',
                focused && i === activeBox ? 'border-2 border-primary' : 'border border-border',
              )}
            >
              <Text className="text-2xl font-bold" style={{ fontVariant: ['tabular-nums'] }}>
                {value[i] ?? ''}
              </Text>
            </View>
          ))}
        </View>
        <TextInput
          ref={input}
          value={value}
          onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={length}
          autoFocus={autoFocus}
          onFocus={() => {
            setFocused(true);
            setTimeout(reveal, 60);
          }}
          onBlur={() => setFocused(false)}
          accessibilityLabel={`${length}-digit code from the email`}
          caretHidden
          className="absolute inset-0 opacity-0"
        />
      </Pressable>
    </View>
  );
}
