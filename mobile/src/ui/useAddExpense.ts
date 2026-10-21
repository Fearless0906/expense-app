/**
 * "Add expense" from anywhere (the floating + button, Home's checklist):
 * no budget yet → the New budget screen; one budget → its form;
 * several → the "Add to which budget?" sheet (app/choose-budget.tsx).
 */
import { router } from 'expo-router';
import { useCallback } from 'react';

import { listAllMembers, listGroups, Member } from '@/lib/repo';
import { useQuery } from '@/lib/useQuery';

import { confirm } from './dialog';

/** Opens the expense form for one budget, or explains that it needs people first. */
export async function addExpenseIn(groupId: string, members: Member[], how: 'push' | 'replace' = 'push') {
  const go = how === 'push' ? router.push : router.replace;
  if (!members.some((m) => m.group_id === groupId && !m.deleted)) {
    const ok = await confirm({
      title: 'Add people first',
      message: 'An expense is split between people, so this budget needs at least one person.',
      confirmLabel: 'Add a person',
    });
    if (ok) go(`/group/${groupId}/new-person`);
    return;
  }
  go(`/group/${groupId}/new-expense`);
}

export function useAddExpense() {
  const groups = useQuery(listGroups, []);
  const members = useQuery(listAllMembers, []);
  return useCallback(() => {
    if (!groups || !members) return; // still loading
    if (groups.length === 0) return router.push('/new-budget');
    if (groups.length === 1) return addExpenseIn(groups[0].id, members);
    router.push('/choose-budget');
  }, [groups, members]);
}
