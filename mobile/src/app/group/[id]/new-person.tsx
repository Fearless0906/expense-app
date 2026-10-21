import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { checkInvite } from '@/lib/invites';
import { addMember, cleanUsername, getMyUsername, listAllMembers, listGroups, listMembers, Member, sameUser } from '@/lib/repo';
import { useQuery } from '@/lib/useQuery';
import { notify } from '@/ui/dialog';
import { Avatar, Button, Card, cx, ErrorText, Field, ListCard, Loading, Row, Screen, SectionTitle } from '@/ui/components';
import { peopleFrom } from '@/ui/rows';
import { colors } from '@/ui/theme';

/** Someone from another budget who has a Hati username, offered for one-tap adding. */
type Known = { key: string; name: string; username: string; joined: boolean; memberId: string; budget: string };

/**
 * Everyone with a username in this account's other budgets (joined or invited), minus
 * yourself and whoever is already in this budget. One entry per username.
 */
function knownPeople(all: Member[], here: Member[], me: string | null, budgetName: (id: string) => string): Known[] {
  const taken = here.filter((m) => !m.deleted).flatMap((m) => [m.joined_username, m.invite_username]);
  const byUser = new Map<string, Known>();
  for (const m of all) {
    if (m.deleted || here.some((h) => h.id === m.id)) continue;
    const username = m.joined_username || m.invite_username;
    if (!username || sameUser(username, me) || taken.some((t) => sameUser(t, username))) continue;
    const key = username.toLowerCase();
    const prev = byUser.get(key);
    // Prefer the entry where they actually joined (it has their photo).
    if (prev && (prev.joined || !m.joined_username)) continue;
    byUser.set(key, {
      key,
      name: m.name,
      username,
      joined: !!m.joined_username,
      memberId: m.id,
      budget: budgetName(m.group_id),
    });
  }
  return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export default function NewPerson() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const members = useQuery(() => listMembers(id), [id]);
  const all = useQuery(listAllMembers, []);
  const groups = useQuery(listGroups, []);
  const me = useQuery(getMyUsername, []);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const usernameRef = useRef<TextInput>(null);

  if (!members || !all || !groups || me === undefined) return <Loading />;

  const people = peopleFrom(all, me);
  const budgetName = (gid: string) => groups.find((g) => g.id === gid)?.name ?? 'another budget';
  const known = knownPeople(all, members, me, budgetName);
  const chosen = known.filter((k) => picked.has(k.key));
  const typedSomeone = !!name.trim() || !!cleanUsername(username);
  const count = chosen.length + (typedSomeone ? 1 : 0);

  function toggle(key: string) {
    setError(undefined);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    if (saving) return;
    if (chosen.length === 0 && !name.trim()) return setError('Enter their name, like “Ben”, or pick someone above.');
    if (typedSomeone && !name.trim()) return setError('Enter a name for the person you typed a username for.');
    setSaving(true);
    setError(undefined);
    try {
      // Check the typed person first, so nothing is saved if their username is wrong.
      const invite = cleanUsername(username);
      let offlineInvite = false;
      if (typedSomeone) {
        // The ticked people count as taken too, so the same person isn't added twice.
        const ticked = chosen.map(
          (k) => ({ id: `picked-${k.key}`, name: k.name, deleted: 0, invite_username: k.username, joined_username: null }) as unknown as Member,
        );
        const taken = [...members!, ...ticked];
        const check = await checkInvite(invite, taken, me ?? null);
        if (check.error) return setError(check.error);
        offlineInvite = !!invite && !!check.offline;
      }
      // People from other budgets already have a checked username: invite them as they are.
      for (const k of chosen) await addMember(id, k.name, k.username);
      if (typedSomeone) await addMember(id, name.trim(), invite);
      router.back();
      if (offlineInvite) {
        void notify(
          'Invite saved',
          `You're offline, so @${invite} couldn't be checked. The invite goes out when you reconnect.`,
        );
      }
    } finally {
      setSaving(false);
    }
  }

  const title =
    count > 1 ? `Add ${count} people` : chosen.length === 1 && !typedSomeone ? `Add ${chosen[0].name}` : cleanUsername(username) ? 'Add and invite' : 'Add person';

  return (
    <Screen>
      {known.length > 0 && (
        <>
          <SectionTitle>From your other budgets</SectionTitle>
          <ListCard>
            {known.map((k, i) => {
              const on = picked.has(k.key);
              return (
                <Pressable
                  key={k.key}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${k.name}, @${k.username}, ${k.joined ? 'in' : 'invited to'} ${k.budget}`}
                  accessibilityHint={on ? 'Won’t be added' : 'Adds them to this budget and sends an invite'}
                  onPress={() => toggle(k.key)}
                  className="active:bg-muted"
                >
                  <Row first={i === 0}>
                    <View className="min-h-11 flex-row items-center gap-3">
                      <Avatar
                        name={k.name}
                        color={people.colorOf(k.memberId)}
                        uri={people.avatarOf(k.memberId)}
                        size={40}
                      />
                      <View className="flex-1 gap-0.5">
                        <Text className="text-base font-semibold text-foreground">{k.name}</Text>
                        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                          @{k.username} · {k.joined ? 'in' : 'invited to'} {k.budget}
                        </Text>
                      </View>
                      <View
                        className={cx(
                          'h-7 w-7 items-center justify-center rounded-full border-2',
                          on ? 'border-primary bg-primary' : 'border-border bg-card',
                        )}
                      >
                        {on && <Ionicons name="checkmark" size={16} color={colors.onInk} />}
                      </View>
                    </View>
                  </Row>
                </Pressable>
              );
            })}
          </ListCard>
          <Text className="px-1 text-sm leading-5 text-muted-foreground">
            They get an invite and see this budget once they accept.
          </Text>
          <SectionTitle>Someone new</SectionTitle>
        </>
      )}

      <Field
        label="Name"
        value={name}
        onChangeText={(v) => {
          setName(v);
          setError(undefined);
        }}
        placeholder="Ben"
        autoFocus={known.length === 0}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => usernameRef.current?.focus()}
      />

      <Card>
        <View className="flex-row items-center gap-2">
          <Ionicons name="mail-outline" size={18} color={colors.ink} />
          <Text className="text-base font-semibold text-foreground">Invite them (optional)</Text>
        </View>
        <Text className="text-sm leading-5 text-muted-foreground">
          If they have a Hati account, enter their username. Once they accept, they see this budget on their phone,
          can add expenses, and see how much they owe.
        </Text>
        <Field
          ref={usernameRef}
          label="Hati username"
          value={username}
          onChangeText={setUsername}
          placeholder="ben"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={save}
        />
      </Card>

      <ErrorText>{error}</ErrorText>
      <Button title={title} icon="person-add-outline" onPress={save} busy={saving} />
    </Screen>
  );
}
