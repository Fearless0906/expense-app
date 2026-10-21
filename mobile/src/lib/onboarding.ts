/**
 * Whether this phone has seen the intro. Kept in SecureStore rather than SQLite, because
 * signing out wipes the database and the intro shouldn't come back after that.
 */
import * as SecureStore from 'expo-secure-store';

const KEY = 'hati.onboarded';

export async function hasOnboarded(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY)) === '1';
}

export function setOnboarded(): Promise<void> {
  return SecureStore.setItemAsync(KEY, '1');
}
