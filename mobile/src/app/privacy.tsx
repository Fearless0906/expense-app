import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { IconName, IconWell, ListCard, Muted, Row, Screen, SectionTitle } from '@/ui/components';
import { colors } from '@/ui/theme';

const SHARED: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'person-circle-outline',
    title: 'Your username and photo',
    body: 'People in a budget you joined see them next to your name, and on expenses you are part of.',
  },
  {
    icon: 'receipt-outline',
    title: 'Expenses and shares in that budget',
    body: 'Everyone in a budget sees all of its expenses, who was involved and what each person owes.',
  },
  {
    icon: 'search-outline',
    title: 'Whether a username exists',
    body: 'Anyone signed in to Hati can check whether a username exists. The app uses this to catch typos when inviting someone.',
  },
];

const PRIVATE: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'mail-outline',
    title: 'Your email',
    body: 'Never shown to anyone. It is only used to send you a code when you forget your password.',
  },
  {
    icon: 'lock-closed-outline',
    title: 'Your password',
    body: 'Stored only as a secure hash on the server, so nobody can read it.',
  },
  {
    icon: 'wallet-outline',
    title: 'Budgets you are not in',
    body: 'Other people only see budgets they were invited to and accepted.',
  },
];

function Item({ icon, title, body, first, good }: { icon: IconName; title: string; body: string; first: boolean; good?: boolean }) {
  return (
    <Row first={first}>
      <View accessible className="flex-row items-start gap-3">
        <IconWell name={icon} size={36} tone={good ? 'good' : 'neutral'} />
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-semibold">{title}</Text>
          <Text className="text-sm leading-5 text-muted-foreground">{body}</Text>
        </View>
      </View>
    </Row>
  );
}

/** Plain-language summary of what Hati shares and what it keeps private. */
export default function Privacy() {
  return (
    <Screen>
      <View className="flex-row items-start gap-2 px-1">
        <Ionicons name="shield-checkmark-outline" size={20} color={colors.remaining} />
        <Muted className="flex-1">Hati only shares what a shared budget needs. Here is exactly what that is.</Muted>
      </View>

      <SectionTitle>People in your budgets see</SectionTitle>
      <ListCard>
        {SHARED.map((x, i) => (
          <Item key={x.title} {...x} first={i === 0} />
        ))}
      </ListCard>

      <SectionTitle>Kept private</SectionTitle>
      <ListCard>
        {PRIVATE.map((x, i) => (
          <Item key={x.title} {...x} first={i === 0} good />
        ))}
      </ListCard>

      <Muted className="px-1">
        Your budgets are also saved on this phone so the app works offline. Signing out clears them from this phone.
      </Muted>
    </Screen>
  );
}
