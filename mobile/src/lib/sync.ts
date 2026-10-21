/**
 * Offline-first sync.
 *
 * 1. Every edit is written to SQLite first and marked dirty, so the app never waits for the network.
 * 2. When online, push sends all dirty rows to Django, then pull fetches what other phones changed.
 * 3. Sync runs on app start, when the network comes back, when the app returns to the foreground,
 *    a moment after every edit, and once a minute.
 */
import NetInfo from '@react-native-community/netinfo';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { api, ApiError, getToken } from './api';
import { notifyChanged } from './changes';
import { COLUMNS, db, getMeta, PULL_ONLY, serialWrite, Table, TABLES } from './db';

type Row = Record<string, unknown>;
type Bind = string | number | null;

export type SyncState = {
  status: 'idle' | 'syncing' | 'offline' | 'error' | 'signed-out';
  message?: string;
  lastSyncedAt?: number;
  pending: number; // local changes not on the server yet
};

let state: SyncState = { status: 'idle', pending: 0 };
const stateListeners = new Set<() => void>();

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  stateListeners.forEach((l) => l());
}

function subscribeState(listener: () => void) {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeState, () => state);
}

// ---- converting rows between SQLite and the server ----

function toServer(table: Table, row: Row): Row {
  const out: Row = {};
  for (const c of COLUMNS[table]) if (!PULL_ONLY.has(c)) out[c] = row[c];
  out.deleted = row.deleted === 1;
  if (table === 'expenses') out.splits = JSON.parse(String(row.splits ?? '[]'));
  return out;
}

function toLocal(table: Table, row: Row): Bind[] {
  return COLUMNS[table].map((c) => {
    const v = row[c];
    if (c === 'deleted') return v ? 1 : 0;
    if (c === 'splits') return JSON.stringify(v ?? []);
    if (c === 'invite_username') return String(v ?? '');
    if (v === undefined || v === null) return null;
    return typeof v === 'number' ? v : String(v);
  });
}

// ---- push & pull ----

async function push() {
  const changes: Partial<Record<Table, Row[]>> = {};
  const sent: { table: Table; id: string; rev: number }[] = [];
  for (const t of TABLES) {
    const rows = await db.getAllAsync<Row>(`SELECT * FROM ${t} WHERE dirty = 1`);
    changes[t] = rows.map((r) => toServer(t, r));
    for (const r of rows) sent.push({ table: t, id: String(r.id), rev: Number(r.local_rev) });
  }
  if (sent.length === 0) return;

  await api('/api/sync/push/', { method: 'POST', body: { changes } });

  // Only clear rows that weren't edited again while the push was in flight.
  await serialWrite(() =>
    db.withExclusiveTransactionAsync(async (txn) => {
      for (const s of sent) {
        await txn.runAsync(`UPDATE ${s.table} SET dirty = 0 WHERE id = ? AND local_rev = ?`, s.id, s.rev);
      }
    }),
  );
}

async function pull() {
  const last = await getMeta('last_pulled_at');
  const query = last ? `?last_pulled_at=${encodeURIComponent(last)}` : '';
  const res = await api<{
    changes: Partial<Record<Table, Row[]>>;
    timestamp: string;
    group_ids?: string[];
    username?: string;
    avatar?: string;
  }>(`/api/sync/pull/${query}`);

  await serialWrite(() =>
    db.withExclusiveTransactionAsync(async (txn) => {
      for (const t of TABLES) {
        const rows = res.changes[t] ?? [];
        if (rows.length === 0) continue;
        const cols = COLUMNS[t];
        const sets = cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`);
        // Never overwrite a row this phone changed but hasn't pushed yet.
        const stmt = await txn.prepareAsync(
          `INSERT INTO ${t} (${cols.join(', ')}, dirty, local_rev)
           VALUES (${cols.map(() => '?').join(', ')}, 0, 0)
           ON CONFLICT(id) DO UPDATE SET ${sets.join(', ')} WHERE ${t}.dirty = 0`,
        );
        try {
          for (const row of rows) await stmt.executeAsync(toLocal(t, row));
        } finally {
          await stmt.finalizeAsync();
        }
      }
      if (Array.isArray(res.group_ids)) {
        // Budgets this account can't see any more (e.g. removed from one): drop the local copy.
        // This only clears this phone's cache; rows not pushed yet stay, so no local work is lost.
        const keep = JSON.stringify(res.group_ids);
        await txn.runAsync('DELETE FROM groups WHERE dirty = 0 AND id NOT IN (SELECT value FROM json_each(?))', keep);
        for (const t of ['members', 'events', 'expenses'] as const) {
          // Personal events have no budget (group_id NULL), so they're never pruned here.
          await txn.runAsync(
            `DELETE FROM ${t} WHERE dirty = 0 AND group_id IS NOT NULL AND group_id NOT IN (SELECT value FROM json_each(?))`,
            keep,
          );
        }
      }
      const upsertMeta =
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value';
      if (res.username) await txn.runAsync(upsertMeta, 'username', res.username);
      if (res.avatar !== undefined) await txn.runAsync(upsertMeta, 'avatar', res.avatar);
      await txn.runAsync(upsertMeta, 'last_pulled_at', res.timestamp);
    }),
  );
}

async function syncOnce() {
  if (!(await getToken())) {
    setState({ status: 'signed-out' });
    return;
  }
  const net = await NetInfo.fetch();
  if (net.isConnected === false) {
    setState({ status: 'offline', message: undefined });
    return;
  }
  setState({ status: 'syncing', message: undefined });
  await push();
  await pull();
  notifyChanged();
  setState({ status: 'idle', lastSyncedAt: Date.now() });
}

let running: Promise<void> | null = null;
let runAgain = false;

/** Sync now. If a sync is already running, one more runs right after it. */
export function syncNow(): Promise<void> {
  if (running) {
    runAgain = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        runAgain = false;
        await syncOnce();
      } while (runAgain);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setState({ status: 'signed-out', message: 'Sign in again to sync.' });
      } else if (e instanceof ApiError) {
        setState({ status: 'error', message: e.message });
      } else {
        setState({ status: 'offline', message: "Can't reach the server right now." });
      }
    } finally {
      running = null;
      await refreshPending();
    }
  })();
  return running;
}

async function refreshPending() {
  const sum = TABLES.map((t) => `(SELECT COUNT(*) FROM ${t} WHERE dirty = 1)`).join(' + ');
  const row = await db.getFirstAsync<{ n: number }>(`SELECT ${sum} AS n`);
  const pending = row?.n ?? 0;
  if (pending !== state.pending) setState({ pending });
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Ask for a sync soon. Many quick edits in a row become one sync. */
export function requestSync(delayMs = 1500): void {
  void refreshPending();
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void syncNow();
  }, delayMs);
}

export function startAutoSync(): () => void {
  const offNet = NetInfo.addEventListener((s) => {
    if (s.isConnected) requestSync(0);
  });
  const appSub = AppState.addEventListener('change', (s) => {
    if (s === 'active') requestSync(0);
  });
  const interval = setInterval(() => requestSync(0), 60_000);
  requestSync(0);
  return () => {
    offNet();
    appSub.remove();
    clearInterval(interval);
  };
}
