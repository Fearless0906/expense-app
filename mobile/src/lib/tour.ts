/**
 * Whether an account has seen the guided tour on this phone. Per account, so a new account
 * gets the tour even on a phone where someone else already saw it. Kept in SecureStore (like the
 * intro flag in lib/onboarding.ts), so signing out and back in doesn't bring it back.
 */
import * as SecureStore from 'expo-secure-store';

/** SecureStore keys allow only letters, digits, ".", "-" and "_". */
const keyFor = (username: string | null) =>
  `hati.toured.${(username ?? 'unknown').toLowerCase().replace(/[^a-z0-9._-]/g, '_')}`;

export async function hasToured(username: string | null): Promise<boolean> {
  return (await SecureStore.getItemAsync(keyFor(username))) === '1';
}

export function setToured(username: string | null): Promise<void> {
  return SecureStore.setItemAsync(keyFor(username), '1');
}
