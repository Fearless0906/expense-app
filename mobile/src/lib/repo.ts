/** All reads and writes the screens use. Writes go to SQLite and then trigger a sync. */
import { randomUUID } from 'expo-crypto';

import { notifyChanged } from './changes';
import { db, serialWrite, Table } from './db';
import { splitAmount } from './split';
import { requestSync } from './sync';

export type Group = { id: string; name: string; credit_limit_cents: number; currency: string };
export type GroupWithSpent = Group & { spent_cents: number };
export type Member = { id: string; group_id: string; name: string; deleted: number };
export type EventRow = {
  id: string;
  group_id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  notes: string;
};
export type Split = { member_id: string; weight: number; amount_cents: number };
export type Expense = {
  id: string;
  group_id: string;
  event_id: string | null;
  name: string;
  amount_cents: number;
  spent_at: string;
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

export async function createGroup(name: string, creditLimitCents: number): Promise<string> {
  const id = randomUUID();
  await insert('groups', { id, name, credit_limit_cents: creditLimitCents, currency: 'PHP' });
  return id;
}

export const setCreditLimit = (id: string, cents: number) => update('groups', id, { credit_limit_cents: cents });
export const deleteGroup = (id: string) => update('groups', id, { deleted: 1 });

// ---- members ----

/** Includes removed members, so old expenses can still show their names. */
export const listMembers = (groupId: string) =>
  db.getAllAsync<Member>('SELECT * FROM members WHERE group_id = ? ORDER BY name COLLATE NOCASE', groupId);

export const addMember = (groupId: string, name: string) =>
  insert('members', { id: randomUUID(), group_id: groupId, name });

export const removeMember = (id: string) => update('members', id, { deleted: 1 });

// ---- events ----

export const listEvents = (groupId: string) =>
  db.getAllAsync<EventRow>('SELECT * FROM events WHERE group_id = ? AND deleted = 0 ORDER BY starts_at', groupId);

export const addEvent = (e: Omit<EventRow, 'id'>) => insert('events', { id: randomUUID(), ...e });
export const deleteEvent = (id: string) => update('events', id, { deleted: 1 });

// ---- expenses ----

export async function listExpenses(groupId: string): Promise<Expense[]> {
  const rows = await db.getAllAsync<Omit<Expense, 'splits'> & { splits: string }>(
    'SELECT * FROM expenses WHERE group_id = ? AND deleted = 0 ORDER BY spent_at DESC',
    groupId,
  );
  return rows.map((r) => ({ ...r, splits: JSON.parse(r.splits) as Split[] }));
}

export type NewExpense = {
  groupId: string;
  eventId: string | null;
  name: string;
  amountCents: number;
  spentAt: Date;
  people: { memberId: string; weight: number }[];
};

export async function addExpense(x: NewExpense) {
  const shares = splitAmount(
    x.amountCents,
    x.people.map((p) => p.weight),
  );
  const splits: Split[] = x.people.map((p, i) => ({ member_id: p.memberId, weight: p.weight, amount_cents: shares[i] }));
  await insert('expenses', {
    id: randomUUID(),
    group_id: x.groupId,
    event_id: x.eventId,
    name: x.name,
    amount_cents: x.amountCents,
    spent_at: x.spentAt.toISOString(),
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
