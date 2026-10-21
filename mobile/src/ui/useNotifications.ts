/**
 * What the notification bell counts and the Notifications screen lists. Nothing is stored:
 * each item is worked out from current data, so it disappears once it no longer applies
 * (invite answered, budget back under 80%, event passed).
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { Invitation, listInvitations } from '@/lib/invites';
import { formatTime, peso } from '@/lib/money';
import { listAllEvents, listGroups } from '@/lib/repo';
import { useSyncState } from '@/lib/sync';
import { useQuery } from '@/lib/useQuery';

/** A budget is "near its limit" from this share of the limit used. */
export const NEAR_LIMIT = 0.8;

export type Notice = {
  key: string;
  kind: 'over' | 'near' | 'event';
  title: string;
  body: string;
  /** The budget it's about; null for a personal event (opens the Events tab). */
  groupId: string | null;
};

/** Pending invitations (needs the server; offline keeps the last list shown). */
export function useInvitations() {
  const { lastSyncedAt } = useSyncState();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const refresh = useCallback(() => {
    listInvitations()
      .then(setInvitations)
      .catch(() => undefined);
  }, []);
  useFocusEffect(refresh);
  useEffect(refresh, [lastSyncedAt, refresh]);
  return { invitations, setInvitations, refresh };
}

export function useNotifications() {
  const { invitations, setInvitations } = useInvitations();
  const groups = useQuery(listGroups, []);
  const events = useQuery(listAllEvents, []);

  const notices: Notice[] = [];
  for (const g of groups ?? []) {
    const left = g.credit_limit_cents - g.spent_cents;
    if (g.credit_limit_cents <= 0) continue;
    if (left < 0) {
      notices.push({
        key: `over-${g.id}`,
        kind: 'over',
        title: `${g.name} is over its limit`,
        body: `Over by ${peso(-left)} of its ${peso(g.credit_limit_cents)} credit limit.`,
        groupId: g.id,
      });
    } else if (g.spent_cents / g.credit_limit_cents >= NEAR_LIMIT) {
      notices.push({
        key: `near-${g.id}`,
        kind: 'near',
        title: `${g.name} is close to its limit`,
        body: `${Math.round((g.spent_cents / g.credit_limit_cents) * 100)}% used · ${peso(left)} left.`,
        groupId: g.id,
      });
    }
  }

  const now = new Date();
  const endOfTomorrow = new Date(now);
  endOfTomorrow.setDate(now.getDate() + 1);
  endOfTomorrow.setHours(23, 59, 59, 999);
  for (const e of events ?? []) {
    const start = new Date(e.starts_at);
    if (start < now || start > endOfTomorrow) continue;
    const day = start.toDateString() === now.toDateString() ? 'Today' : 'Tomorrow';
    const budget = groups?.find((g) => g.id === e.group_id)?.name;
    notices.push({
      key: `event-${e.id}`,
      kind: 'event',
      title: `${e.title} · ${day} at ${formatTime(e.starts_at)}`,
      body: [budget, e.location].filter(Boolean).join(' · ') || 'Coming up soon.',
      groupId: e.group_id,
    });
  }

  return {
    invitations,
    setInvitations,
    notices,
    count: invitations.length + notices.length,
    loading: !groups || !events,
  };
}
