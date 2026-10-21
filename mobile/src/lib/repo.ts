/** All reads and writes the screens use. Writes go to SQLite and then trigger a sync. */
import { randomUUID } from 'expo-crypto';

import { notifyChanged } from './changes';
import { db, getMeta, serialWrite, Table } from './db';
import { splitAmount } from './split';
import { requestSync } from './sync';

export type Group = {
  id: string;
  name: string;
  credit_limit_cents: number;
  currency: string;
  owner_username: string | null; // null until the first pull after creating it
};
export type GroupWithSpent = Group & { spent_cents: number };
export type Member = {
  id: string;
  group_id: string;
  name: string;
  deleted: number;
  seq: number; // order added on this phone (rowid), for stable person colors
  invite_username: string; // pending invite, '' if none
  joined_username: string | null; // account that accepted, set by the server
  joined_avatar: string | null; // that account's photo (media path), set by the server
};
export type EventRow = {
  id: string;
  /** null for personal events (new ones); older events may belong to a budget. */
  group_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  notes: string;
};
/** `fixed`: the amount was typed in by hand (exact amounts) rather than split by weight. */
export type Split = { member_id: string; weight: number; amount_cents: number; fixed?: boolean };
export type Expense = {
  id: string;
  group_id: string;
  event_id: string | null;
  name: string;
  amount_cents: number;
  spent_at: string;
  due_at: string | null;
  splits: Split[];
};

type Value = string | number | null;

function changed() {
  notifyChanged();
  requestSync();
}

async function insert(table: Table, row: Record<string, Value>) {
  const cols = Object.keys(row);
  await serialWrite(() =>
    db.runAsync(
      `INSERT INTO ${table} (${cols.join(', ')}, dirty, local_rev) VALUES (${cols.map(() => '?').join(', ')}, 1, 1)`,
      cols.map((c) => row[c]),
    ),
  );
  changed();
}

async function update(table: Table, id: string, fields: Record<string, Value>) {
  const cols = Object.keys(fields);
  await serialWrite(() =>
    db.runAsync(
      `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, dirty = 1, local_rev = local_rev + 1 WHERE id = ?`,
      [...cols.map((c) => fields[c]), id],
    ),
  );
  changed();
}

// ---- groups (a budget with a credit limit) ----

export const listGroups = () =>
  db.getAllAsync<GroupWithSpent>(
    `SELECT g.*, COALESCE((SELECT SUM(e.amount_cents) FROM expenses e
                           WHERE e.group_id = g.id AND e.deleted = 0), 0) AS spent_cents
     FROM groups g WHERE g.deleted = 0 ORDER BY g.name COLLATE NOCASE`,
  );

export const getGroup = (id: string) => db.getFirstAsync<Group>('SELECT * FROM groups WHERE id = ? AND deleted = 0', id);

/**
 * Creates a budget and adds its creator as a person in it (`me` = their username), so the
 * owner is part of the split and shows up for everyone they invite. The server links that
 * person to the owner's account on the next sync (see _link_owner_to_self in sync.py).
 */
export async function createGroup(name: string, creditLimitCents: number, me?: string | null): Promise<string> {
  const id = randomUUID();
  await insert('groups', { id, name, credit_limit_cents: creditLimitCents, currency: 'PHP' });
  if (me) await addMember(id, me.charAt(0).toUpperCase() + me.slice(1), me); // "kate" → person "Kate"
  return id;
}

export const setCreditLimit = (id: string, cents: number) => update('groups', id, { credit_limit_cents: cents });
export const deleteGroup = (id: string) => update('groups', id, { deleted: 1 });

// ---- members ----

/** Includes removed members, so old expenses can still show their names. */
export const listMembers = (groupId: string) =>
  db.getAllAsync<Member>(
    'SELECT *, rowid AS seq FROM members WHERE group_id = ? ORDER BY name COLLATE NOCASE',
    groupId,
  );

export const addMember = (groupId: string, name: string, inviteUsername = '') =>
  insert('members', { id: randomUUID(), group_id: groupId, name, invite_username: cleanUsername(inviteUsername) });

/** Invite (or re-invite) a person by username; '' cancels a pending invite. */
export const setInvite = (id: string, username: string) =>
  update('members', id, { invite_username: cleanUsername(username) });

export const cleanUsername = (u: string) => u.trim().replace(/^@+/, '').trim();

/** The signed-in username, saved by every pull. null before the first sync. */
export const getMyUsername = () => getMeta('username');

/** The signed-in account's photo as a media path ("avatars/…jpg"), '' or null for initials. */
export const getMyAvatar = () => getMeta('avatar');

export const sameUser = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Is this person the signed-in user? Linked to their account, or their own just-added self
 * that's waiting for the next sync to link it (only the owner can add their own username).
 */
export const isMemberMe = (m: Member, me: string | null | undefined) =>
  sameUser(m.joined_username, me) || sameUser(m.invite_username, me);

export type InviteStatus = 'joined' | 'pending' | 'none';
export const inviteStatus = (m: Member): InviteStatus =>
  m.joined_username ? 'joined' : m.invite_username ? 'pending' : 'none';

export const removeMember = (id: string) => update('members', id, { deleted: 1 });

/** Every person in every budget on this phone (for the Expenses, Events and Profile tabs). */
export const listAllMembers = () =>
  db.getAllAsync<Member>(
    `SELECT m.*, m.rowid AS seq FROM members m
     JOIN groups g ON g.id = m.group_id AND g.deleted = 0
     ORDER BY m.name COLLATE NOCASE`,
  );

// ---- events ----

/** Every event, soonest first: personal ones, plus older events of budgets still on this phone. */
export const listAllEvents = () =>
  db.getAllAsync<EventRow>(
    `SELECT e.* FROM events e
     WHERE e.deleted = 0
       AND (e.group_id IS NULL OR EXISTS (SELECT 1 FROM groups g WHERE g.id = e.group_id AND g.deleted = 0))
     ORDER BY e.starts_at`,
  );

/** Events are personal and separate from budgets: only this account sees them. */
export const addEvent = (e: Omit<EventRow, 'id' | 'group_id'>) =>
  insert('events', { id: randomUUID(), group_id: null, ...e });
export const deleteEvent = (id: string) => update('events', id, { deleted: 1 });

// ---- expenses ----

type ExpenseRowDb = Omit<Expense, 'splits'> & { splits: string };
const parseExpense = (r: ExpenseRowDb): Expense => ({ ...r, splits: JSON.parse(r.splits) as Split[] });

/** One expense, or null if it was deleted (here or on another phone). */
export async function getExpense(id: string): Promise<Expense | null> {
  const row = await db.getFirstAsync<ExpenseRowDb>('SELECT * FROM expenses WHERE id = ? AND deleted = 0', id);
  return row ? parseExpense(row) : null;
}

export async function listExpenses(groupId: string): Promise<Expense[]> {
  const rows = await db.getAllAsync<ExpenseRowDb>(
    'SELECT * FROM expenses WHERE group_id = ? AND deleted = 0 ORDER BY spent_at DESC',
    groupId,
  );
  return rows.map(parseExpense);
}

/** Expenses across all budgets, newest first. */
export async function listAllExpenses(): Promise<Expense[]> {
  const rows = await db.getAllAsync<ExpenseRowDb>(
    `SELECT x.* FROM expenses x
     JOIN groups g ON g.id = x.group_id AND g.deleted = 0
     WHERE x.deleted = 0 ORDER BY x.spent_at DESC`,
  );
  return rows.map(parseExpense);
}

export type NewExpense = {
  groupId: string;
  name: string;
  amountCents: number;
  spentAt: Date;
  dueAt: Date | null;
  people: { memberId: string; weight: number }[];
  /** Exact amounts typed per person (centavos), instead of splitting by weight. Must add up. */
  amounts?: Record<string, number>;
};

export async function addExpense(x: NewExpense) {
  const amounts = x.amounts;
  let splits: Split[];
  if (amounts) {
    splits = x.people.map((p) => ({ member_id: p.memberId, weight: 1, amount_cents: amounts[p.memberId], fixed: true }));
  } else {
    const shares = splitAmount(
      x.amountCents,
      x.people.map((p) => p.weight),
    );
    splits = x.people.map((p, i) => ({ member_id: p.memberId, weight: p.weight, amount_cents: shares[i] }));
  }
  await insert('expenses', {
    id: randomUUID(),
    group_id: x.groupId,
    event_id: null, // events are a separate schedule; the column stays for older expenses
    name: x.name,
    amount_cents: x.amountCents,
    spent_at: x.spentAt.toISOString(),
    due_at: x.dueAt ? x.dueAt.toISOString() : null,
    splits: JSON.stringify(splits),
  });
}

export const deleteExpense = (id: string) => update('expenses', id, { deleted: 1 });

// ---- totals (computed, never stored, so offline edits can't make them wrong) ----

export function summarize(group: Group, expenses: Expense[]) {
  const usedBy = new Map<string, number>();
  let spent = 0;
  for (const e of expenses) {
    spent += e.amount_cents;
    for (const s of e.splits) usedBy.set(s.member_id, (usedBy.get(s.member_id) ?? 0) + s.amount_cents);
  }
  return { limit: group.credit_limit_cents, spent, remaining: group.credit_limit_cents - spent, usedBy };
}

/** One person's part of each expense they were in, newest first, plus the total they owe. */
export function sharesOf(memberId: string, expenses: Expense[]) {
  const items = expenses.flatMap((e) => {
    const s = e.splits.find((x) => x.member_id === memberId);
    return s ? [{ expense: e, share: s.amount_cents, weight: s.weight }] : [];
  });
  return { items, total: items.reduce((a, x) => a + x.share, 0) };
}
