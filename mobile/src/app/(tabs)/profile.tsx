import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { ReactNode, useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { API_URL, ApiError, setToken } from '@/lib/api';
import {
  deleteAccount,
  getMe,
  Me,
  offlineMessage,
  removeAvatar,
  setEmail,
  signOutOtherPhones,
  uploadAvatar,
} from '@/lib/auth';
import { resetLocalData } from '@/lib/db';
import { mediaUrl } from '@/lib/media';
import { formatTime, peso } from '@/lib/money';
import { getMyAvatar, getMyUsername, isMemberMe, listAllExpenses, listAllMembers, listGroups, sharesOf } from '@/lib/repo';
import { syncNow, useSyncState } from '@/lib/sync';
import { useQuery } from '@/lib/useQuery';
import {
  Avatar,
  Button,
  cx,
  IconName,
  IconWell,
  ListCard,
  Loading,
  Money,
  Row,
  Screen,
  SectionTitle,
  TabHeader,
} from '@/ui/components';
import { confirm, notify, prompt } from '@/ui/dialog';
import { startTour, tourTarget } from '@/ui/Tour';
import { colors, personColors } from '@/ui/theme';

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : offlineMessage());

export default function ProfileTab() {
  const groups = useQuery(listGroups, []);
  const members = useQuery(listAllMembers, []);
  const expenses = useQuery(listAllExpenses, []);
  const me = useQuery(getMyUsername, []);
  const myAvatar = useQuery(getMyAvatar, []);
  const sync = useSyncState();

  // Account details (email) come from the server; offline we just say so.
  const [account, setAccount] = useState<Me | null | 'offline'>(null);
  const loadAccount = useCallback(() => {
    getMe()
      .then(setAccount)
      .catch(() => setAccount((a) => (a && a !== 'offline' ? a : 'offline')));
  }, []);
  useFocusEffect(loadAccount);
  const [photoBusy, setPhotoBusy] = useState(false);

  if (!groups || !members || !expenses || me === undefined || myAvatar === undefined) return <Loading />;

  const perBudget = groups.map((g) => {
    const mine = members.find((m) => m.group_id === g.id && !m.deleted && isMemberMe(m, me));
    const share = mine ? sharesOf(mine.id, expenses.filter((x) => x.group_id === g.id)) : null;
    return { group: g, mine, share };
  });
  const linked = perBudget.filter((b) => b.mine);
  const myTotal = linked.reduce((a, b) => a + (b.share?.total ?? 0), 0);
  const myCount = linked.reduce((a, b) => a + (b.share?.items.length ?? 0), 0);
  const email = account && account !== 'offline' ? account.email : null;

  // ---- photo ----
  async function choosePhoto() {
    if (photoBusy) return;
    let picked: ImagePicker.ImagePickerResult;
    try {
      picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
    } catch (e) {
      return notify("Couldn't open your photos", e instanceof Error ? e.message : String(e));
    }
    if (picked.canceled || !picked.assets[0]) return;
    setPhotoBusy(true);
    try {
      setAccount(await uploadAvatar(picked.assets[0].uri));
    } catch (e) {
      await notify("Couldn't change your photo", errorText(e));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function deletePhoto() {
    const ok = await confirm({
      title: 'Remove your photo?',
      message: 'Your initials show instead, here and for the people in your budgets.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    setPhotoBusy(true);
    try {
      setAccount(await removeAvatar());
    } catch (e) {
      await notify("Couldn't remove your photo", errorText(e));
    } finally {
      setPhotoBusy(false);
    }
  }

  // ---- account ----
  async function editEmail() {
    const value = await prompt({
      title: email ? 'Change email' : 'Add an email',
      message: 'We only use it to send a code if you forget your password.',
      label: 'Email',
      initial: email ?? '',
      placeholder: 'ana@example.com',
      keyboardType: 'email-address',
      confirmLabel: 'Save email',
      validate: (v) => (/^\S+@\S+\.\S+$/.test(v.trim()) ? null : 'Enter a valid email address, like ana@example.com.'),
    });
    if (value === null) return;
    try {
      setAccount(await setEmail(value));
    } catch (e) {
      await notify("Couldn't save the email", errorText(e));
    }
  }

  // ---- privacy & security ----
  async function otherPhones() {
    const ok = await confirm({
      title: 'Sign out of other phones?',
      message: 'Every other phone using your account is signed out. This phone stays signed in.',
      confirmLabel: 'Sign them out',
    });
    if (!ok) return;
    try {
      await signOutOtherPhones();
      await notify('Done', 'Other phones were signed out. They need your password to sign in again.');
    } catch (e) {
      await notify("Couldn't sign out other phones", errorText(e));
    }
  }

  async function removeAccount() {
    const owned = groups!.filter((g) => g.owner_username && me && g.owner_username.toLowerCase() === me.toLowerCase());
    const ok = await confirm({
      title: 'Delete your account?',
      message:
        (owned.length
          ? `The ${owned.length === 1 ? 'budget' : `${owned.length} budgets`} you own (${owned.map((g) => g.name).join(', ')}) will be deleted for everyone. `
          : '') +
        'In other budgets your name stays on past expenses so the totals still add up. This can’t be undone.',
      confirmLabel: 'Continue',
      destructive: true,
    });
    if (!ok) return;
    const password = await prompt({
      title: 'Confirm with your password',
      label: 'Password',
      secure: true,
      confirmLabel: 'Delete account',
      destructive: true,
      validate: (v) => (v ? null : 'Enter your password.'),
    });
    if (password === null) return;
    try {
      await deleteAccount(password);
      router.replace('/login');
      void notify('Account deleted', 'Your account and this phone’s data were removed.');
    } catch (e) {
      await notify("The account wasn't deleted", errorText(e));
    }
  }

  async function signOut() {
    const ok = await confirm({
      title: 'Sign out?',
      message: sync.pending
        ? `${sync.pending} change${sync.pending === 1 ? " hasn't" : "s haven't"} synced yet and will be lost.`
        : 'Your data stays on the server. This phone will be cleared.',
      confirmLabel: 'Sign out',
      destructive: true,
    });
    if (!ok) return;
    await resetLocalData();
    await setToken(null);
    router.replace('/login');
  }

  const syncText =
    sync.status === 'syncing'
      ? 'Syncing…'
      : sync.status === 'offline'
        ? "You're offline"
        : sync.status === 'error'
          ? "Couldn't sync the last changes"
          : sync.status === 'signed-out'
            ? 'Signed out. Sign in again to sync.'
            : sync.lastSyncedAt
              ? `Synced at ${formatTime(new Date(sync.lastSyncedAt).toISOString())}`
              : 'Not synced yet';

  return (
    <Screen tab>
      <TabHeader title="Profile" />

      {/* Photo, name, email */}
      <View className="items-center gap-3 pb-1">
        <Pressable
          ref={tourTarget('profile-photo')}
          accessibilityRole="button"
          accessibilityLabel="Change your photo"
          accessibilityHint="Opens your photo library"
          onPress={choosePhoto}
          className="active:opacity-80"
        >
          <Avatar name={me ?? '?'} color={personColors[1]} uri={mediaUrl(myAvatar)} size={96} />
          <View className="absolute bottom-0 right-0 h-9 w-9 items-center justify-center rounded-full border-2 border-background bg-primary">
            {photoBusy ? (
              <ActivityIndicator size="small" color={colors.onInk} />
            ) : (
              <Ionicons name="camera" size={16} color={colors.onInk} />
            )}
          </View>
        </Pressable>
        <View className="items-center gap-0.5">
          <Text className="text-2xl font-bold tracking-tight">{me ? `@${me}` : 'Your account'}</Text>
          <Text className="text-sm text-muted-foreground">
            {email || (account === 'offline' ? 'Offline' : 'No email yet')} · {groups.length} budget
            {groups.length === 1 ? '' : 's'}
          </Text>
        </View>
        {myAvatar ? (
          <Pressable accessibilityRole="button" onPress={deletePhoto} hitSlop={8} className="min-h-9 justify-center active:opacity-60">
            <Text className="text-sm font-semibold text-destructive">Remove photo</Text>
          </Pressable>
        ) : null}
      </View>

      {/* What you owe, everywhere */}
      <View className="gap-2 rounded-3xl bg-primary p-6">
        <Text className="text-sm font-medium text-on-ink-muted">Your share, all budgets</Text>
        <Money cents={myTotal} className="text-4xl font-extrabold tracking-tight text-on-ink" />
        <Text className="text-xs font-medium text-on-ink-muted">
          {linked.length === 0
            ? "You aren't linked to a person in any budget yet"
            : `From ${myCount} expense${myCount === 1 ? '' : 's'} in ${linked.length} budget${linked.length === 1 ? '' : 's'}`}
        </Text>
      </View>

      {groups.length > 0 && (
        <>
          <SectionTitle>By budget</SectionTitle>
          <ListCard>
            {perBudget.map(({ group: g, mine, share }, i) => (
              <SettingsRow
                key={g.id}
                first={i === 0}
                icon="wallet-outline"
                label={g.name}
                detail={mine ? `As ${mine.name} · ${share?.items.length ?? 0} expenses` : 'Tap your name in People, then “This is me”'}
                value={mine ? peso(share?.total ?? 0) : 'Not linked'}
                onPress={() =>
                  mine
                    ? router.push({ pathname: '/group/[id]/person/[memberId]', params: { id: g.id, memberId: mine.id } })
                    : router.push(`/group/${g.id}`)
                }
              />
            ))}
          </ListCard>
        </>
      )}

      <SectionTitle>Account</SectionTitle>
      <ListCard>
        <SettingsRow
          first
          icon={account !== 'offline' && account && !email ? 'alert-circle-outline' : 'mail-outline'}
          tone={account !== 'offline' && account && !email ? 'warn' : undefined}
          label="Email"
          detail={
            account === 'offline'
              ? 'Connect to the internet to see or change it'
              : email
                ? email
                : 'Add one so you can reset your password'
          }
          onPress={account === 'offline' ? undefined : editEmail}
        />
        <SettingsRow
          icon="key-outline"
          label="Change password"
          detail="Other phones are signed out afterwards"
          onPress={() => router.push('/change-password')}
        />
      </ListCard>

      <SectionTitle>Privacy & security</SectionTitle>
      <ListCard>
        <SettingsRow
          first
          icon="eye-outline"
          label="What others can see"
          detail="Your name, photo and shares in budgets you're in"
          onPress={() => router.push('/privacy')}
        />
        <SettingsRow
          icon="phone-portrait-outline"
          label="Sign out of other phones"
          detail="Keeps this phone signed in"
          onPress={otherPhones}
        />
        <SettingsRow icon="trash-outline" tone="danger" label="Delete account" detail="Asks for your password" onPress={removeAccount} />
      </ListCard>

      <SectionTitle>App</SectionTitle>
      <ListCard>
        <SettingsRow
          first
          icon={sync.status === 'error' ? 'warning-outline' : sync.status === 'offline' ? 'cloud-offline-outline' : 'cloud-done-outline'}
          tone={sync.status === 'error' ? 'warn' : undefined}
          label={syncText}
          detail={
            sync.pending
              ? `${sync.pending} change${sync.pending === 1 ? '' : 's'} waiting to sync`
              : 'Everything on this phone is on the server'
          }
          right={
            <Button title="Sync now" variant="ghost" busy={sync.status === 'syncing'} onPress={() => void syncNow()} />
          }
        />
        <SettingsRow
          icon="map-outline"
          label="Show the app tour"
          detail="A quick walk through where everything is"
          onPress={startTour} // it opens each page itself, starting with Home
        />
        <SettingsRow icon="server-outline" label="Server" detail={API_URL} />
        <SettingsRow icon="information-circle-outline" label="Version" detail={`Hati ${Constants.expoConfig?.version ?? ''}`} />
      </ListCard>

      <Button title="Sign out" icon="log-out-outline" variant="danger" onPress={signOut} />
    </Screen>
  );
}

/** One line in a settings list: icon, label, optional detail / value, chevron when tappable. */
function SettingsRow({
  icon,
  label,
  detail,
  value,
  onPress,
  right,
  first,
  tone,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  value?: string;
  onPress?: () => void;
  right?: ReactNode;
  first?: boolean;
  tone?: 'danger' | 'warn';
}) {
  const body = (
    <Row first={first}>
      <View className="min-h-9 flex-row items-center gap-3">
        <IconWell name={icon} size={36} tone={tone ? 'over' : 'neutral'} />
        <View className="flex-1 gap-0.5">
          <Text className={cx('text-base font-semibold', tone === 'danger' && 'text-destructive')}>{label}</Text>
          {detail ? (
            <Text className="text-xs text-muted-foreground" numberOfLines={2}>
              {detail}
            </Text>
          ) : null}
        </View>
        {value ? (
          <Text className="text-sm font-semibold" style={{ fontVariant: ['tabular-nums'] }}>
            {value}
          </Text>
        ) : null}
        {right}
        {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.muted} /> : null}
      </View>
    </Row>
  );
  if (!onPress) return <View accessible={!right}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[label, detail, value].filter(Boolean).join(', ')}
      onPress={onPress}
      className="active:bg-muted"
    >
      {body}
    </Pressable>
  );
}
