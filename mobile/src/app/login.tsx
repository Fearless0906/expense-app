import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { api, API_URL, ApiError, setToken } from '@/lib/api';
import { requestSync } from '@/lib/sync';
import { Button, Card, ErrorText, Field, Muted, Screen } from '@/ui/components';
import { colors } from '@/ui/theme';

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      const { token } = await api<{ token: string }>(mode === 'login' ? '/api/auth/login/' : '/api/auth/register/', {
        method: 'POST',
        body: { username: username.trim(), password },
        auth: false,
      });
      await setToken(token);
      requestSync(0);
      router.replace('/');
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : `Can't reach the server at ${API_URL}. Check that Django is running and your phone is on the same Wi-Fi.`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card>
        <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink }}>Hati</Text>
        <Muted>
          Split shared expenses against a credit limit. You need internet to sign in once; after that the app works
          offline.
        </Muted>
        <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
        <ErrorText>{error}</ErrorText>
        <Button
          title={mode === 'login' ? 'Sign in' : 'Create account'}
          onPress={submit}
          busy={busy}
          disabled={!username.trim() || !password}
        />
        <Pressable onPress={() => setMode(mode === 'login' ? 'register' : 'login')} hitSlop={8}>
          <Muted style={{ textAlign: 'center' }}>
            {mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}
          </Muted>
        </Pressable>
      </Card>
    </Screen>
  );
}
