import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { ApiError } from '@/lib/api';
import { offlineMessage, passwordChecks, requestResetCode, resetPassword } from '@/lib/auth';
import { AuthScreen, CodeInput, PasswordField, PasswordRules } from '@/ui/auth';
import { Button, ErrorText, Muted } from '@/ui/components';
import { notify } from '@/ui/dialog';
import { colors } from '@/ui/theme';

const RESEND_SECONDS = 60; // the server sends at most one code a minute

export default function ResetPassword() {
  const params = useLocalSearchParams<{ identifier: string; sent?: string }>();
  const identifier = params.identifier ?? '';
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [wait, setWait] = useState(RESEND_SECONDS);
  const againRef = useRef<TextInput>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const rulesOk = passwordChecks(password).every((c) => c.ok);
  const matches = again.length > 0 && again === password;
  const ready = code.length === 6 && rulesOk && matches;

  async function submit() {
    if (busy) return;
    if (code.length !== 6) return setError('Enter the 6-digit code from the email.');
    if (!rulesOk) return setError('Choose a password that meets the rules below it.');
    if (!matches) return setError("The two passwords don't match.");
    setBusy(true);
    setError(undefined);
    try {
      await resetPassword(identifier, code, password);
      router.replace('/');
      void notify('Password changed', "You're signed in. Any other phone using this account was signed out.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : offlineMessage());
      setBusy(false);
    }
  }

  async function resend() {
    if (wait > 0) return;
    setError(undefined);
    try {
      await requestResetCode(identifier);
      setCode('');
      setWait(RESEND_SECONDS);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : offlineMessage());
    }
  }

  return (
    <AuthScreen
      title="Create a new password"
      subtitle={params.sent ?? "If that account has an email address, we sent it a 6-digit code."}
    >
      <View className="flex-row items-center gap-2 rounded-lg bg-accent px-3 py-2.5">
        <Ionicons name="mail-unread-outline" size={18} color={colors.remaining} />
        <Text className="flex-1 text-sm leading-5">
          Code for <Text className="text-sm font-semibold">{identifier}</Text>
        </Text>
      </View>

      <CodeInput value={code} onChange={setCode} autoFocus />
      <View className="flex-row items-center justify-between">
        <Muted>Didn't get it? Check spam first.</Muted>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: wait > 0 }}
          disabled={wait > 0}
          onPress={resend}
          hitSlop={8}
          className="min-h-11 justify-center active:opacity-60"
        >
          <Text className={wait > 0 ? 'text-sm text-muted-foreground' : 'text-sm font-semibold text-remaining'}>
            {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
          </Text>
        </Pressable>
      </View>

      <PasswordField
        label="New password"
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => againRef.current?.focus()}
      />
      <PasswordRules password={password} />
      <PasswordField
        ref={againRef}
        label="Type it again"
        value={again}
        onChangeText={setAgain}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {again.length > 0 && !matches ? <Muted className="text-destructive">The passwords don't match yet.</Muted> : null}

      <ErrorText>{error}</ErrorText>
      <Button title="Save new password" icon="lock-closed-outline" onPress={submit} busy={busy} disabled={!ready} />
    </AuthScreen>
  );
}
