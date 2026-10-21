import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { ApiError } from '@/lib/api';
import { declineInvitation, Invitation, joinAs } from '@/lib/invites';
import { peso } from '@/lib/money';

import { ButtonLabel } from './components';
import { colors } from './theme';

/** A pending invitation with Accept / Decline. Used on Home and on the Notifications screen. */
export function InvitationCard({
  invitation: inv,
  onDone,
}: {
  invitation: Invitation;
  onDone: (groupId: string | null) => void;
}) {
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string>();

  async function run(kind: 'accept' | 'decline') {
    if (busy) return;
    setBusy(kind);
    setError(undefined);
    try {
      if (kind === 'accept') onDone(await joinAs(inv.member_id));
      else {
        await declineInvitation(inv.member_id);
        onDone(null);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Can't reach the server. Try again when you're online.");
      setBusy(null);
    }
  }

  return (
    <View accessibilityLiveRegion="polite" className="gap-4 rounded-3xl bg-primary p-5">
      <View className="flex-row items-start gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-hero-track">
          <Ionicons name="mail-open-outline" size={20} color={colors.onInk} />
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-xs font-semibold uppercase tracking-wider text-on-ink-muted">Invitation</Text>
          <Text className="text-base font-semibold text-on-ink">
            @{inv.owner_username} invited you to “{inv.group_name}”
          </Text>
          <Text className="text-sm leading-5 text-on-ink-muted">
            You'll join as {inv.member_name}, see the budget's {peso(inv.credit_limit_cents)} credit limit, and see how
            much you owe.
          </Text>
        </View>
      </View>
      {error ? <Text className="text-sm leading-5 text-on-ink-over">{error}</Text> : null}
      <View className="flex-row gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !!busy, busy: busy === 'decline' }}
          disabled={!!busy}
          onPress={() => run('decline')}
          className="h-12 flex-1 items-center justify-center rounded-lg bg-hero-track active:opacity-80"
        >
          <ButtonLabel className="text-on-ink">{busy === 'decline' ? 'Declining…' : 'Decline'}</ButtonLabel>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !!busy, busy: busy === 'accept' }}
          disabled={!!busy}
          onPress={() => run('accept')}
          className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-card active:opacity-80"
        >
          <Ionicons name="checkmark" size={18} color={colors.ink} />
          <ButtonLabel className="text-foreground">{busy === 'accept' ? 'Joining…' : 'Accept'}</ButtonLabel>
        </Pressable>
      </View>
    </View>
  );
}
