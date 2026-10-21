import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { TextInput } from 'react-native';

import { ApiError } from '@/lib/api';
import { offlineMessage, passwordChecks, signUp } from '@/lib/auth';
import { AuthFooterLink, AuthScreen, PasswordField, PasswordRules } from '@/ui/auth';
import { Button, ErrorText, Field } from '@/ui/components';

export default function SignUp() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const rulesOk = passwordChecks(password, username).every((c) => c.ok);
  const ready = !!username.trim() && !!email.trim() && rulesOk;

  async function submit() {
    if (busy) return;
    if (!username.trim()) return setError('Choose a username, like “ana”.');
    if (username.includes('@')) return setError("A username can't contain @.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address, like ana@example.com.');
    if (!rulesOk) return setError('Choose a password that meets the rules below it.');
    setBusy(true);
    setError(undefined);
    try {
      await signUp(username, email, password);
      router.replace('/');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : offlineMessage());
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen
      title="Create your account"
      subtitle="Share budgets with friends and see exactly what everyone owes."
      footer={<AuthFooterLink text="Already have an account?" link="Sign in" onPress={() => router.replace('/login')} />}
    >
      <Field
        label="Username"
        hint="Friends invite you to budgets with this."
        value={username}
        onChangeText={setUsername}
        placeholder="ana"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username-new"
        textContentType="username"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <Field
        ref={emailRef}
        label="Email"
        hint="Only used to reset your password if you forget it."
        value={email}
        onChangeText={setEmail}
        placeholder="ana@example.com"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        keyboardType="email-address"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <PasswordField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <PasswordRules password={password} username={username} />
      <ErrorText>{error}</ErrorText>
      <Button title="Create account" icon="person-add-outline" onPress={submit} busy={busy} disabled={!ready} />
    </AuthScreen>
  );
}
