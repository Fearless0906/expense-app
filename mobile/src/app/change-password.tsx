import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { TextInput } from 'react-native';

import { ApiError } from '@/lib/api';
import { changePassword, offlineMessage, passwordChecks } from '@/lib/auth';
import { getMyUsername } from '@/lib/repo';
import { useQuery } from '@/lib/useQuery';
import { PasswordField, PasswordRules } from '@/ui/auth';
import { Button, Card, ErrorText, Muted, Screen } from '@/ui/components';
import { notify } from '@/ui/dialog';

export default function ChangePassword() {
  const me = useQuery(getMyUsername, []);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const newRef = useRef<TextInput>(null);
  const againRef = useRef<TextInput>(null);

  const rulesOk = passwordChecks(password, me ?? '').every((c) => c.ok);
  const matches = again.length > 0 && again === password;
  const ready = !!current && rulesOk && matches;

  async function submit() {
    if (busy) return;
    if (!current) return setError('Enter your current password.');
    if (!rulesOk) return setError('Choose a new password that meets the rules below it.');
    if (!matches) return setError("The two new passwords don't match.");
    setBusy(true);
    setError(undefined);
    try {
      await changePassword(current, password);
      router.back();
      void notify('Password changed', 'Any other phone using your account was signed out.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : offlineMessage());
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Muted>Choose a new password. This phone stays signed in; any other phone has to sign in again.</Muted>
      <Card className="gap-4">
        <PasswordField
          label="Current password"
          value={current}
          onChangeText={setCurrent}
          autoComplete="current-password"
          textContentType="password"
          autoFocus
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => newRef.current?.focus()}
        />
        <PasswordField
          ref={newRef}
          label="New password"
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => againRef.current?.focus()}
        />
        <PasswordRules password={password} username={me ?? ''} />
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
      </Card>
    </Screen>
  );
}
