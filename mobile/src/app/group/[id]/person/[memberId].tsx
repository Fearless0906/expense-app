import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { ApiError } from '@/lib/api';
import { checkInvite, joinAs } from '@/lib/invites';
import { dueLabel, formatDay, peso } from '@/lib/money';
import { mediaUrl } from '@/lib/media';
import {
  getGroup,
  getMyUsername,
  inviteStatus,
  isMemberMe,
  listExpenses,
  listMembers,
  Member,
  removeMember,
  sameUser,
  setInvite,
  sharesOf,
  summarize,
} from '@/lib/repo';
import { useQuery } from '@/lib/useQuery';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  IconWell,
  ListCard,
  Loading,
  Money,
  Muted,
  Row,
  Screen,
  SectionTitle,
} from '@/ui/components';
import { confirm, notify } from '@/ui/dialog';
import { colors, personColorMap } from '@/ui/theme';

export default function PersonScreen() {
  const { id, memberId } = useLocalSearchParams<{ id: string; memberId: string }>();
  const group = useQuery(() => getGroup(id), [id]);
  const members = useQuery(() => listMembers(id), [id]);
  const expenses = useQuery(() => listExpenses(id), [id]);
  const me = useQuery(getMyUsername, []);

  if (group === undefined || !members || !expenses || me === undefined) return <Loading />;
  const m = members.find((x) => x.id === memberId);
  if (group === null || !m) {
    return (
      <Screen>
        <EmptyState icon="trash-outline" title="This person isn't in the budget any more" />
      </Screen>
    );
  }

  const isMe = isMemberMe(m, me);
  const { items, total } = sharesOf(m.id, expenses);
  const { spent } = summarize(group, expenses);
  const pct = spent > 0 ? Math.round((total / spent) * 100) : 0;
  const color = personColorMap(members).get(m.id) ?? colors.track;

  return (
    <Screen>
      <Stack.Screen options={{ title: isMe ? `${m.name} (you)` : m.name }} />

      <View className="gap-4 rounded-3xl bg-primary p-6">
        <View className="flex-row items-center gap-3">
          <Avatar name={m.name} color={color} uri={mediaUrl(m.joined_avatar)} size={40} />
          <View className="flex-1">
            <Text className="text-sm font-medium text-on-ink-muted">{isMe ? 'Your share' : `${m.name}'s share`}</Text>
            <Money cents={total} className="text-4xl font-extrabold tracking-tight text-on-ink" />
          </View>
        </View>
        <Text className="text-xs font-medium text-on-ink-muted">
          {items.length === 0
            ? 'Not in any expense yet'
            : `${items.length} expense${items.length === 1 ? '' : 's'} · ${pct}% of the ${peso(spent)} spent`}
        </Text>
      </View>

      {m.deleted ? (
        <Muted>Removed from this budget. Their share in past expenses stays as it was.</Muted>
      ) : (
        <AccountCard member={m} members={members} me={me} isOwner={sameUser(group.owner_username, me)} />
      )}

      <SectionTitle>{isMe ? 'What you owe' : 'Their expenses'}</SectionTitle>
      {items.length === 0 ? (
        <EmptyState icon="receipt-outline" title="No expenses yet">
          {isMe ? 'Expenses you were part of show up here.' : `Expenses ${m.name} was part of show up here.`}
        </EmptyState>
      ) : (
        <ListCard>
          {items.map(({ expense: x, share, weight }, i) => {
            return (
              <Row key={x.id} first={i === 0}>
                <View
                  accessible
                  accessibilityLabel={`${x.name}, share ${peso(share)} of ${peso(x.amount_cents)}, ${formatDay(x.spent_at)}`}
                  className="flex-row items-center gap-3"
                >
                  <IconWell name="receipt-outline" />
                  <View className="flex-1 gap-0.5">
                    <Text className="text-base font-semibold text-foreground">{x.name}</Text>
                    <Text className="text-xs text-muted-foreground">
                      {formatDay(x.spent_at)}
                      {weight > 1 ? ` · ${weight}× share` : ''}
                      {x.due_at ? ` · ${dueLabel(x.due_at)}` : ''}
                    </Text>
                  </View>
                  <View className="items-end gap-0.5">
                    <Money cents={share} />
                    <Text className="text-xs text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>
                      of {peso(x.amount_cents)}
                    </Text>
                  </View>
                </View>
              </Row>
            );
          })}
        </ListCard>
      )}

      {!m.deleted && (
        <Button
          title="Remove from budget"
          icon="person-remove-outline"
          variant="danger"
          onPress={async () => {
            const ok = await confirm({
              title: `Remove ${m.name}?`,
              message: m.joined_username
                ? `Their share in past expenses stays as it is, and @${m.joined_username} loses access to this budget.`
                : 'Their share in past expenses stays as it is.',
              confirmLabel: 'Remove',
              destructive: true,
            });
            if (!ok) return;
            await removeMember(m.id);
            router.back();
          }}
        />
      )}
    </Screen>
  );
}

/** Joined / invite pending / not invited, plus the actions for each. */
function AccountCard({
  member: m,
  members,
  me,
  isOwner,
}: {
  member: Member;
  members: Member[];
  me: string | null;
  isOwner: boolean;
}) {
  const status = inviteStatus(m);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const iAmLinked = members.some((x) => !x.deleted && isMemberMe(x, me));

  async function sendInvite() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const check = await checkInvite(username, members, me, m.id);
      if (check.error) return setError(check.error);
      if (!username.trim()) return setError("Enter their Hati username, like “ben”.");
      await setInvite(m.id, username);
      setEditing(false);
      setUsername('');
      if (check.offline) {
        void notify('Invite saved', "You're offline, so the username couldn't be checked. The invite goes out when you reconnect.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function thisIsMe() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await joinAs(m.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'You need internet for this. Try again when you are online.');
    } finally {
      setBusy(false);
    }
  }

  if (isMemberMe(m, me)) {
    return (
      <Card className="flex-row items-center">
        <Ionicons name="person-circle" size={22} color={colors.remaining} />
        <View className="flex-1">
          <Text className="text-base font-semibold text-foreground">This is you</Text>
          <Muted>You're @{me}. You see this budget and what you owe.</Muted>
        </View>
      </Card>
    );
  }

  if (status === 'joined') {
    return (
      <Card className="flex-row items-center">
        <Ionicons name="checkmark-circle" size={22} color={colors.remaining} />
        <View className="flex-1">
          <Text className="text-base font-semibold text-foreground">Joined</Text>
          <Muted>Signed in as @{m.joined_username}. They see this budget and what they owe.</Muted>
        </View>
      </Card>
    );
  }

  const form = (
    <>
      <Field
        label="Hati username"
        value={username}
        onChangeText={setUsername}
        placeholder="ben"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={editing}
        returnKeyType="send"
        onSubmitEditing={sendInvite}
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Send invite" icon="paper-plane-outline" onPress={sendInvite} busy={busy} />
    </>
  );

  if (status === 'pending') {
    return (
      <Card>
        <View className="flex-row items-center gap-3">
          <Ionicons name="time-outline" size={22} color={colors.ink} />
          <View className="flex-1 gap-1">
            <Text className="text-base font-semibold text-foreground">Invite pending</Text>
            <Muted>
              Sent to @{m.invite_username}. They'll see this budget once they accept it in their Hati app.
            </Muted>
          </View>
        </View>
        {editing ? (
          form
        ) : (
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button title="Change" variant="secondary" onPress={() => setEditing(true)} />
            </View>
            <View className="flex-1">
              <Button title="Cancel invite" variant="danger" onPress={() => setInvite(m.id, '')} />
            </View>
          </View>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <View className="flex-row items-center gap-2">
        <Ionicons name="mail-outline" size={18} color={colors.ink} />
        <Text className="text-base font-semibold text-foreground">Invite to Hati</Text>
      </View>
      <Muted>Once they accept, {m.name} sees this budget on their phone and how much they owe.</Muted>
      {form}
      {isOwner && !iAmLinked && (
        <View className="gap-2 border-t border-border pt-3">
          <Muted>Or, if this person is you:</Muted>
          <Button title="This is me" icon="person-circle-outline" variant="secondary" onPress={thisIsMe} busy={busy} />
        </View>
      )}
    </Card>
  );
}
