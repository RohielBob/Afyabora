// Onglet « Partager » (L5-06, CDC F7 étape 1) : point d'entrée du partage avec un médecin. Il explique en
// trois points ce qui se passe (le QR ne contient aucune donnée, l'accès est limité, le patient garde la
// main), mène à « Partager mon historique », et donne accès au journal « Qui a consulté mes données »
// (L5-09), au rapport « Préparer ma consultation » (L6-03) et à la carte d'urgence (L6-06). Le partage exige le réseau : c'est dit dès cet écran.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Button, Card, ListRow, Screen, Text } from '@/components/ui';
import { enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const PROMISES: { key: string; icon: IconName }[] = [
  { key: 'noData', icon: 'shield-checkmark-outline' },
  { key: 'limited', icon: 'time-outline' },
  { key: 'control', icon: 'hand-left-outline' },
];

export default function ShareScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Text variant="overline" tone="primary">
          {t('share.home.overline')}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {t('share.home.title')}
        </Text>
      </View>
      <Text tone="muted">{t('share.home.intro')}</Text>

      <Card variant="tinted" index={0} style={{ gap: spacing.lg }}>
        {PROMISES.map(({ key, icon }) => (
          <View
            key={key}
            style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: radii.sm,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surface,
              }}
            >
              <Ionicons name={icon} size={20} color={colors.primaryText} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">{t(`share.home.promise.${key}.title`)}</Text>
              <Text variant="bodySmall" tone="muted">
                {t(`share.home.promise.${key}.text`)}
              </Text>
            </View>
          </View>
        ))}
      </Card>

      <Animated.View entering={enterFromBelow(1, reduced)} style={{ gap: spacing.sm }}>
        <Button
          label={t('share.home.start')}
          size="lg"
          icon={<Ionicons name="qr-code-outline" size={20} color={colors.onPrimary} />}
          onPress={() => router.push('/share/new')}
        />
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.xs,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="wifi-outline" size={14} color={colors.textMuted} />
          <Text variant="caption" tone="muted">
            {t('share.home.network')}
          </Text>
        </View>
      </Animated.View>

      <Card variant="outlined" index={2} style={{ padding: 6, gap: 0 }}>
        <ListRow
          icon={<Ionicons name="document-text-outline" size={20} color={colors.primaryText} />}
          title={t('share.home.report')}
          subtitle={t('share.home.reportHint')}
          onPress={() => router.push('/report')}
        />
        <ListRow
          icon={<Ionicons name="eye-outline" size={20} color={colors.primaryText} />}
          title={t('share.home.log')}
          subtitle={t('share.home.logHint')}
          onPress={() => router.push('/share/log')}
        />
        <ListRow
          icon={<Ionicons name="medkit-outline" size={20} color={colors.primaryText} />}
          title={t('share.home.emergency')}
          subtitle={t('share.home.emergencyHint')}
          onPress={() => router.push('/emergency')}
        />
      </Card>
    </Screen>
  );
}
