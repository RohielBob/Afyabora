// Réglages → Langue : la langue de l'application. Accessible AVEC ou SANS compte (aussi depuis l'accueil) :
// une personne qui ne lit pas le français doit pouvoir changer de langue avant de s'inscrire.
//  - « Langue du téléphone » (par défaut) : la langue du téléphone si l'application la connaît, sinon le
//    français ;
//  - chaque langue est écrite dans sa propre langue (« Español », « Português ») pour être reconnue ;
//  - une traduction pas encore relue par une personne qui parle la langue est signalée.
import { getLocales } from 'expo-localization';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, Card, ChoiceGroup, InlineAlert, Screen, Text } from '@/components/ui';
import {
  LANGUAGES,
  languageInfo,
  resolveLanguage,
  setLanguagePreference,
  useLanguagePreference,
  type LanguagePreference,
} from '@/i18n';
import { spacing } from '@/theme';

export default function LanguageScreen() {
  const { t } = useTranslation();
  const preference = useLanguagePreference();
  const phoneLanguage = languageInfo(
    resolveLanguage(
      'system',
      getLocales().map((locale) => locale.languageCode),
    ),
  );
  const someInReview = LANGUAGES.some((language) => !language.reviewed);

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Text variant="overline" tone="primary">
          {t('settings.overline')}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {t('language.title')}
        </Text>
        <Text tone="muted">{t('language.intro')}</Text>
      </View>

      <Card variant="outlined" index={0}>
        <ChoiceGroup<LanguagePreference>
          label={t('language.title')}
          value={preference}
          columns={1}
          onChange={(next) => void setLanguagePreference(next)}
          options={[
            {
              value: 'system',
              label: t('language.system'),
              hint: t('language.systemHint', { name: phoneLanguage.nativeName }),
            },
            ...LANGUAGES.map((language) => ({
              value: language.code,
              label: language.nativeName,
              hint: language.reviewed ? undefined : t('language.inReview'),
            })),
          ]}
        />
      </Card>

      {someInReview ? <InlineAlert tone="info" message={t('language.inReviewNote')} /> : null}
      <Text variant="bodySmall" tone="muted">
        {t('language.serverNote')}
      </Text>
      {router.canGoBack() ? (
        <Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />
      ) : null}
    </Screen>
  );
}
