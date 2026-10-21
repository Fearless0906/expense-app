import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { ApiError } from '@/lib/api';
import { offlineMessage, signIn } from '@/lib/auth';
import { AuthFooterLink, AuthScreen, PasswordField } from '@/ui/auth';
import { Button, ErrorText, Field, Muted } from '@/ui/components';
import { colors } from '@/ui/theme';

export default function SignIn() {
  // Older links opened this screen in "register" mode; that's its own screen now.
  const params = useLocalSearchParams<{ mode?: string; identifier?: string }>();
  const [identifier, setIdentifier] = useState(params.identifier ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const passwordRef = useRef<TextInput>(null);
  const ready = !!identifier.trim() && !!password;

  if (params.mode === 'register') return <Redirect href="/signup" />;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await signIn(identifier, password);
      router.replace('/');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : offlineMessage());
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen
      title="Welcome back"
      subtitle="Sign in to see your budgets and what you owe."
      footer={
        <>
          <AuthFooterLink text="New to Hati?" link="Create an account" onPress={() => router.replace('/signup')} />
          <View className="flex-row items-start gap-2 px-1 pt-2">
            <Ionicons name="cloud-done-outline" size={18} color={colors.muted} />
            <Muted className="flex-1">You need internet to sign in. After that, everything works offline.</Muted>
          </View>
        </>
      }
    >
      <Field
        label="Username or email"
        value={identifier}
        onChangeText={setIdentifier}
        placeholder="ana or ana@example.com"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        keyboardType="email-address"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <View className="gap-1">
        <PasswordField
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/forgot-password', params: { identifier: identifier.trim() } })}
          hitSlop={8}
          className="min-h-11 justify-center self-end active:opacity-60"
        >
          <Text className="text-sm font-semibold text-remaining">Forgot password?</Text>
        </Pressable>
      </View>
      <ErrorText>{error}</ErrorText>
      <Button title="Sign in" icon="log-in-outline" onPress={submit} busy={busy} disabled={!ready} />
    </AuthScreen>
  );
}
