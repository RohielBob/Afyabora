import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card, ListRow, Screen, Text } from '@/components/ui';
import { languageInfo, useLanguagePreference, type LanguageCode } from '@/i18n';
import { ACCENT_LABELS, useAppearance, useTheme } from '@/theme';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const languagePreference = useLanguagePreference();
  const { preference, accent } = useAppearance();
  const ico = (name: keyof typeof Ionicons.glyphMap) => (
    <Ionicons name={name} size={20} color={colors.primaryText} />
  );

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Text variant="overline" tone="primary">
          {t('settings.overline')}
        </Text>
        <Text variant="title">{t('settings.title')}</Text>
      </View>

      <Card variant="outlined" index={0} style={{ padding: 6, gap: 0 }}>
        <ListRow
          icon={ico('color-palette-outline')}
          title={t('settings.appearance')}
          subtitle={t('settings.appearanceHint')}
          value={`${t(`appearance.${preference}`)} · ${ACCENT_LABELS[accent]}`}
          onPress={() => router.push('/settings/appearance')}
        />
        <ListRow
          icon={ico('language-outline')}
          title={t('settings.language')}
          subtitle={t('settings.languageHint')}
          value={
            languagePreference === 'system'
              ? t('language.system')
              : languageInfo(i18n.language as LanguageCode).nativeName
          }
          onPress={() => router.push('/settings/language')}
        />
        <ListRow
          icon={ico('speedometer-outline')}
          title={t('settings.units')}
          subtitle={t('settings.unitsHint')}
          onPress={() => router.push('/settings/units-thresholds')}
        />
        <ListRow
          icon={ico('notifications-outline')}
          title={t('settings.notifications')}
          subtitle={t('settings.notificationsHint')}
          onPress={() => router.push('/settings/notifications')}
        />
        <ListRow
          icon={ico('lock-closed-outline')}
          title={t('settings.security')}
          subtitle={t('settings.securityHint')}
          onPress={() => router.push('/settings/security')}
        />
        <ListRow
          icon={ico('person-circle-outline')}
          title={t('settings.account')}
          subtitle={t('settings.accountHint')}
          onPress={() => router.push('/settings/account')}
        />
        <ListRow
          icon={ico('information-circle-outline')}
          title={t('settings.about')}
          subtitle={t('settings.aboutHint')}
          onPress={() => router.push('/settings/about')}
        />
      </Card>

      {__DEV__ ? (
        <Card variant="tinted" index={1} style={{ padding: 6, gap: 0 }}>
          <ListRow
            icon={ico('brush-outline')}
            title={t('settings.design')}
            subtitle={t('settings.designHint')}
            onPress={() => router.push('/settings/design')}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
