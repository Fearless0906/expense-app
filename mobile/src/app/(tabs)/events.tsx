import { router } from 'expo-router';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { listAllEvents } from '@/lib/repo';
import { useQuery } from '@/lib/useQuery';
import { Button, Card, EmptyState, IconWell, Loading, Screen, SyncBanner, TabHeader } from '@/ui/components';
import { EventCard } from '@/ui/rows';
import { tourTarget } from '@/ui/Tour';

export default function EventsTab() {
  const events = useQuery(listAllEvents, []);

  if (!events) return <Loading />;

  const now = new Date().toISOString();
  const upcoming = events.filter((e) => e.starts_at >= now);
  const past = events.filter((e) => e.starts_at < now).reverse();
  const next = upcoming[0];

  const daysUntil = next
    ? Math.round((new Date(next.starts_at).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000)
    : 0;

  return (
    <Screen tab>
      <TabHeader title="Events" subtitle="Your schedule" />
      <SyncBanner />
      <View ref={tourTarget('new-event')} collapsable={false}>
        <Button title="New event" icon="calendar-outline" onPress={() => router.push('/new-event')} />
      </View>

      {next && (
        <Card className="flex-row items-center">
          <IconWell name="sparkles-outline" tone="good" />
          <View className="flex-1 gap-0.5">
            <Text className="text-xs font-medium text-muted-foreground">Next up</Text>
            <Text className="text-base font-semibold text-foreground">{next.title}</Text>
            <Text className="text-xs text-muted-foreground">
              {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil} days`} ·{' '}
              {upcoming.length} upcoming
            </Text>
          </View>
        </Card>
      )}

      {events.length === 0 ? (
        <EmptyState icon="calendar-outline" title="No events yet">
          Tap New event to add one, like a meeting or a thesis defense.
        </EmptyState>
      ) : (
        <>
          {upcoming.length > 0 && <SectionLabel>Upcoming</SectionLabel>}
          {upcoming.map((e) => (
            <EventCard key={e.id} event={e} isPast={false} />
          ))}
          {past.length > 0 && <SectionLabel>Past</SectionLabel>}
          {past.map((e) => (
            <EventCard key={e.id} event={e} isPast />
          ))}
          <Text className="px-1 text-sm leading-5 text-muted-foreground">
            Swipe an event left to delete it.
          </Text>
        </>
      )}
    </Screen>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" className="mt-1 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </Text>
  );
}
