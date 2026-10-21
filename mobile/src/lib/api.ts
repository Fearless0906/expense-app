import * as SecureStore from 'expo-secure-store';

/**
 * Where Django runs. On a real phone this must be your PC's LAN IP, not localhost.
 * Set it in mobile/.env:  EXPO_PUBLIC_API_URL=http://192.168.1.10:8000
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.2.110:8000').replace(/\/$/, '');

const TOKEN_KEY = 'auth_token';
let cachedToken: string | null | undefined;

export async function getToken(): Promise<string | null> {
  if (cachedToken === undefined) cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  return cachedToken;
}

export async function setToken(token: string | null): Promise<void> {
  cachedToken = token;
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Options = { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; auth?: boolean };

export async function api<T>(path: string, { method = 'GET', body, auth = true }: Options = {}): Promise<T> {
  const token = auth ? await getToken() : null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Token ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError(res.status, data.detail ?? data.non_field_errors?.[0] ?? `Server error ${res.status}`);
    }
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}
