/**
 * Account calls (need the server): sign in / up, forgot + reset password, and the account's
 * email. See backend/expenses/accounts.py.
 */
import { api, API_URL, ApiError, getToken, setToken } from './api';
import { notifyChanged } from './changes';
import { resetLocalData, setMeta } from './db';
import { setOnboarded } from './onboarding';
import { requestSync } from './sync';

type Session = { token: string; username: string };

/** Shown when the server can't be reached at all (not an error answer from it). */
export const offlineMessage = () =>
  `Can't reach the server at ${API_URL}. Check that Django is running and your phone is on the same Wi-Fi.`;

/** Sign-in, sign-up and reset all end the same way: keep the token and who we are, then sync. */
async function startSession(s: Session) {
  await setToken(s.token);
  await setMeta('username', s.username); // known right away, so a new budget can add its creator
  await setOnboarded();
  requestSync(0);
}

export async function signIn(identifier: string, password: string) {
  await startSession(
    await api<Session>('/api/auth/login/', { method: 'POST', body: { identifier: identifier.trim(), password }, auth: false }),
  );
}

export async function signUp(username: string, email: string, password: string) {
  await startSession(
    await api<Session>('/api/auth/register/', {
      method: 'POST',
      body: { username: username.trim(), email: email.trim(), password },
      auth: false,
    }),
  );
}

/** Always answers the same message, whether or not the account exists. */
export async function requestResetCode(identifier: string): Promise<string> {
  const res = await api<{ detail: string }>('/api/auth/password/forgot/', {
    method: 'POST',
    body: { identifier: identifier.trim() },
    auth: false,
  });
  return res.detail;
}

/** Sets the new password and signs in on this phone (every other phone is signed out). */
export async function resetPassword(identifier: string, code: string, password: string) {
  await startSession(
    await api<Session>('/api/auth/password/reset/', {
      method: 'POST',
      body: { identifier: identifier.trim(), code, password },
      auth: false,
    }),
  );
}

export type Me = { username: string; email: string; avatar: string };
export const getMe = () => api<Me>('/api/auth/me/');
export const setEmail = (email: string) => api<Me>('/api/auth/me/', { method: 'POST', body: { email: email.trim() } });

/** What the server's password rules check, shown live while typing. The server has the final say. */
export function passwordChecks(password: string, username = '') {
  const u = username.trim().toLowerCase();
  return [
    { label: '8 or more characters', ok: password.length >= 8 },
    { label: 'Not only numbers', ok: password.length > 0 && !/^\d+$/.test(password) },
    {
      label: 'Different from your username',
      ok: password.length > 0 && (!u || !password.toLowerCase().includes(u)),
    },
  ];
}


// ---- signed-in account settings ----

async function rememberAvatar(path: string) {
  await setMeta('avatar', path);
  notifyChanged(); // screens showing the avatar re-read it
}

/** Uploads a photo picked on the phone (a local file uri) as the profile photo. */
export async function uploadAvatar(localUri: string): Promise<Me> {
  const form = new FormData();
  // React Native's FormData takes {uri, name, type} for a file.
  form.append('avatar', { uri: localUri, name: 'avatar.jpg', type: 'image/jpeg' } as unknown as Blob);
  const { status, data } = await postForm(`${API_URL}/api/auth/avatar/`, form, await getToken());
  if (status < 200 || status >= 300) throw new ApiError(status, data.detail ?? `Server error ${status}`);
  await rememberAvatar(data.avatar);
  return data as Me;
}

/**
 * Sends a multipart form with XMLHttpRequest, not fetch: since SDK 57 the global fetch is
 * expo/fetch, which can't send React Native's {uri} file parts. XHR still uses React Native's
 * networking, which reads the file from the phone. Rejects only when the server can't be reached.
 */
function postForm(url: string, form: FormData, token: string | null) {
  return new Promise<{ status: number; data: any }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (token) xhr.setRequestHeader('Authorization', `Token ${token}`);
    xhr.timeout = 30000;
    xhr.onload = () => {
      let data: any = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      resolve({ status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error('Network request failed'));
    xhr.ontimeout = () => reject(new Error('The upload took too long'));
    xhr.send(form);
  });
}

export async function removeAvatar(): Promise<Me> {
  const me = await api<Me>('/api/auth/avatar/', { method: 'DELETE' });
  await rememberAvatar('');
  return me;
}

/** Changes the password; this phone stays signed in, every other phone is signed out. */
export async function changePassword(currentPassword: string, password: string) {
  const s = await api<Session>('/api/auth/password/change/', {
    method: 'POST',
    body: { current_password: currentPassword, password },
  });
  await setToken(s.token);
}

/** Signs out every other phone using this account; this one keeps going with a new token. */
export async function signOutOtherPhones() {
  const s = await api<Session>('/api/auth/sessions/others/', { method: 'POST' });
  await setToken(s.token);
}

/** Deletes the account on the server, then clears this phone. */
export async function deleteAccount(password: string) {
  await api('/api/auth/delete/', { method: 'POST', body: { password } });
  await resetLocalData();
  await setToken(null);
}
