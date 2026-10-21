import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { EmptyState, IconName, IconWell, ListCard, Loading, Muted, Row, Screen, SectionTitle } from '@/ui/components';
import { InvitationCard } from '@/ui/InvitationCard';
import { colors } from '@/ui/theme';
import { Notice, useNotifications } from '@/ui/useNotifications';

const LOOK: Record<Notice['kind'], { icon: IconName; tone: 'over' | 'neutral' | 'good' }> = {
  over: { icon: 'alert-circle-outline', tone: 'over' },
  near: { icon: 'speedometer-outline', tone: 'neutral' },
  event: { icon: 'calendar-outline', tone: 'good' },
};

/** Everything the bell counts: invitations, budgets over or near their limit, events today/tomorrow. */
export default function Notifications() {
  const { invitations, setInvitations, notices, loading } = useNotifications();
  if (loading) return <Loading />;

  const budgets = notices.filter((n) => n.kind !== 'event');
  const soon = notices.filter((n) => n.kind === 'event');

  if (invitations.length === 0 && notices.length === 0) {
    return (
      <Screen>
        <EmptyState icon="notifications-outline" title="You're all caught up">
          Invitations, budgets close to their limit, and events coming up today or tomorrow show up here.
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen>
      {invitations.length > 0 && (
        <>
          <SectionTitle>Invitations</SectionTitle>
          {invitations.map((inv) => (
            <InvitationCard
              key={inv.member_id}
              invitation={inv}
              onDone={(groupId) => {
                setInvitations((all) => all.filter((x) => x.member_id !== inv.member_id));
                if (groupId) router.replace(`/group/${groupId}`);
              }}
            />
          ))}
        </>
      )}
      {budgets.length > 0 && <NoticeList title="Budgets" items={budgets} />}
      {soon.length > 0 && <NoticeList title="Coming up" items={soon} />}
      <Muted className="px-1">These clear by themselves once they no longer apply.</Muted>
    </Screen>
  );
}

function NoticeList({ title, items }: { title: string; items: Notice[] }) {
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      <ListCard>
        {items.map((n, i) => (
          <Pressable
            key={n.key}
            accessibilityRole="button"
            accessibilityLabel={`${n.title}. ${n.body}`}
            accessibilityHint={n.groupId ? 'Opens the budget' : 'Opens your events'}
            onPress={() => (n.groupId ? router.push(`/group/${n.groupId}`) : router.navigate('/events'))}
            className="active:bg-muted"
          >
            <Row first={i === 0}>
              <View className="flex-row items-center gap-3">
                <IconWell name={LOOK[n.kind].icon} tone={LOOK[n.kind].tone} />
                <View className="flex-1 gap-0.5">
                  <Text className={n.kind === 'over' ? 'text-base font-semibold text-destructive' : 'text-base font-semibold'}>
                    {n.title}
                  </Text>
                  <Text className="text-sm leading-5 text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>
                    {n.body}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </View>
            </Row>
          </Pressable>
        ))}
      </ListCard>
    </>
  );
}
