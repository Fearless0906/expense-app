import * as SQLite from 'expo-sqlite';

/** The phone's own copy of the data. The app always reads and writes here, online or not. */
export const db = SQLite.openDatabaseSync('hati.db');

export type Table = 'groups' | 'members' | 'events' | 'expenses';
export const TABLES: Table[] = ['groups', 'members', 'events', 'expenses'];

/** Columns shared with the server. Must match FIELDS in backend/expenses/sync.py (plus id). */
export const COLUMNS: Record<Table, string[]> = {
  groups: ['id', 'name', 'credit_limit_cents', 'currency', 'deleted'],
  members: ['id', 'group_id', 'name', 'deleted'],
  events: ['id', 'group_id', 'title', 'starts_at', 'ends_at', 'location', 'notes', 'deleted'],
  expenses: ['id', 'group_id', 'event_id', 'name', 'amount_cents', 'spent_at', 'splits', 'deleted'],
};

// Every synced table also has two local-only columns:
//   dirty      1 = changed on this phone and not pushed yet
//   local_rev  goes up on every local edit, so an edit made while a push is in flight stays dirty
const SYNC_COLS = `
  deleted INTEGER NOT NULL DEFAULT 0,
  dirty INTEGER NOT NULL DEFAULT 0,
  local_rev INTEGER NOT NULL DEFAULT 0`;

/** Append new migrations to the end. Never edit one that has shipped. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE groups (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    credit_limit_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'PHP',${SYNC_COLS}
  );
  CREATE TABLE members (
    id TEXT PRIMARY KEY NOT NULL,
    group_id TEXT NOT NULL,
    name TEXT NOT NULL,${SYNC_COLS}
  );
  CREATE INDEX members_group ON members (group_id);
  CREATE TABLE events (
    id TEXT PRIMARY KEY NOT NULL,
    group_id TEXT NOT NULL,
    title TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT,
    location TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',${SYNC_COLS}
  );
  CREATE INDEX events_group ON events (group_id, starts_at);
  CREATE TABLE expenses (
    id TEXT PRIMARY KEY NOT NULL,
    group_id TEXT NOT NULL,
    event_id TEXT,
    name TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    spent_at TEXT NOT NULL,
    splits TEXT NOT NULL DEFAULT '[]',${SYNC_COLS}
  );
  CREATE INDEX expenses_group ON expenses (group_id, spent_at);
  CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);
  `,
];

let migrating: Promise<void> | null = null;

export function migrate(): Promise<void> {
  migrating ??= (async () => {
    await db.execAsync('PRAGMA journal_mode = WAL;');
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    for (let v = row?.user_version ?? 0; v < MIGRATIONS.length; v++) {
      const sql = MIGRATIONS[v];
      await db.withExclusiveTransactionAsync(async (txn) => {
        await txn.execAsync(sql);
        await txn.execAsync(`PRAGMA user_version = ${v + 1}`);
      });
    }
  })();
  return migrating;
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs database writes one at a time. A sync writing pulled rows and the user
 * saving an expense at the same moment would otherwise hit "database is locked".
 */
export function serialWrite<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.catch(() => undefined);
  return result;
}

export async function getMeta(key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string | null }>('SELECT value FROM meta WHERE key = ?', key);
  return row?.value ?? null;
}

/** Wipes everything on this phone (used on sign out). */
export function resetLocalData(): Promise<void> {
  return serialWrite(() =>
    db.withExclusiveTransactionAsync(async (txn) => {
      for (const t of TABLES) await txn.execAsync(`DELETE FROM ${t}`);
      await txn.execAsync('DELETE FROM meta');
    }),
  );
}
