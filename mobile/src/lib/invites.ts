/**
 * Invites need the server: a pending invite isn't in the invited user's sync yet,
 * because it grants no access until they accept. See backend/expenses/invites.py.
 */
import { api } from './api';
import { cleanUsername, Member, sameUser } from './repo';
import { syncNow } from './sync';

export type Invitation = {
  member_id: string;
  member_name: string;
  group_id: string;
  group_name: string;
  owner_username: string;
  credit_limit_cents: number;
};

export const listInvitations = () => api<Invitation[]>('/api/invitations/');

export async function usernameExists(username: string): Promise<boolean> {
  const res = await api<{ exists: boolean }>(`/api/users/exists/?username=${encodeURIComponent(username)}`);
  return res.exists;
}

/** Accept an invite, or (for the budget owner) say "this person is me". Syncs so the budget arrives. */
export async function joinAs(memberId: string): Promise<string> {
  const { group_id } = await api<{ group_id: string }>(`/api/members/${memberId}/join/`, { method: 'POST' });
  await syncNow();
  return group_id;
}

export async function declineInvitation(memberId: string): Promise<void> {
  await api(`/api/members/${memberId}/decline/`, { method: 'POST' });
}

/**
 * Checks a username before inviting. `offline` means it couldn't be checked; the invite
 * still saves and syncs later, it just stays pending if the name is wrong.
 */
export async function checkInvite(
  username: string,
  members: Member[],
  me: string | null,
  forMemberId?: string,
): Promise<{ error?: string; offline?: boolean }> {
  const u = cleanUsername(username);
  if (!u) return {};
  if (sameUser(u, me)) return { error: "That's your own username." };
  const taken = members.find(
    (m) => !m.deleted && m.id !== forMemberId && (sameUser(m.joined_username, u) || sameUser(m.invite_username, u)),
  );
  if (taken) return { error: `@${u} is already ${taken.joined_username ? 'in this budget' : 'invited'} as ${taken.name}.` };
  try {
    if (!(await usernameExists(u))) {
      return { error: `There's no Hati account named @${u}. Check the spelling with them.` };
    }
  } catch {
    return { offline: true };
  }
  return {};
}
