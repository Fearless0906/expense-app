import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ApiError } from '@/lib/api';
import { offlineMessage, requestResetCode } from '@/lib/auth';
import { AuthFooterLink, AuthScreen } from '@/ui/auth';
import { Button, ErrorText, Field } from '@/ui/components';

export default function ForgotPassword() {
  const params = useLocalSearchParams<{ identifier?: string }>();
  const [identifier, setIdentifier] = useState(params.identifier ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit() {
    if (busy) return;
    if (!identifier.trim()) return setError('Enter your username or the email on your account.');
    setBusy(true);
    setError(undefined);
    try {
      const sent = await requestResetCode(identifier);
      router.push({ pathname: '/reset-password', params: { identifier: identifier.trim(), sent } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : offlineMessage());
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen
      title="Forgot your password?"
      subtitle="Enter your username or email. We'll email you a 6-digit code to set a new password."
      footer={<AuthFooterLink text="Remembered it?" link="Back to sign in" onPress={() => router.back()} />}
    >
      <Field
        label="Username or email"
        value={identifier}
        onChangeText={setIdentifier}
        placeholder="ana or ana@example.com"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        keyboardType="email-address"
        autoFocus={!identifier}
        returnKeyType="send"
        onSubmitEditing={submit}
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Send code" icon="mail-outline" onPress={submit} busy={busy} />
    </AuthScreen>
  );
}
