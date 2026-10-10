// Page d'un document légal (politique de confidentialité ou avertissement) : en-tête, version, sections
// en cartes qui apparaissent l'une après l'autre, rappel « en cas d'urgence », bouton « Fermer ».
// Ouverte avec OU sans compte (depuis l'inscription comme depuis À propos).
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, Card, InlineAlert, Screen, Text } from '@/components/ui';
import { spacing, useTheme } from '@/theme';
import { LEGAL_VERSION, legalSections, type LegalDocumentKind } from '../legal';

// Une icône par section : on repère d'un coup d'œil le sujet d'une carte dans un texte long.
const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  data: 'document-text-outline',
  purpose: 'compass-outline',
  storage: 'phone-portrait-outline',
  sharing: 'qr-code-outline',
  emergency: 'medical-outline',
  analysis: 'analytics-outline',
  retention: 'time-outline',
  rights: 'hand-left-outline',
  does: 'checkmark-circle-outline',
  doesNot: 'close-circle-outline',
  quality: 'create-outline',
  treatment: 'medkit-outline',
  alerts: 'notifications-outline',
};

export function LegalDocument({ kind }: { kind: LegalDocumentKind }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const sections = legalSections(kind);

  // Retour à l'écran précédent (ex. formulaire d'inscription, saisie conservée) ; lien ouvert
  // directement : retour à l'entrée de l'app.
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Text variant="overline" tone="primary">
          {t(`legal.${kind}.overline`)}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {t(`legal.${kind}.title`)}
        </Text>
        <Text variant="caption" tone="subtle">
          {t('legal.updated', { version: LEGAL_VERSION, date: t('legal.date') })}
        </Text>
      </View>

      <Text tone="muted">{t(`legal.${kind}.intro`)}</Text>

      {sections.map((section, i) => (
        <Card key={section.id} variant="outlined" index={i}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Ionicons
              name={ICONS[section.id] ?? 'ellipse-outline'}
              size={20}
              color={colors.primaryText}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text variant="subheading" accessibilityRole="header" style={{ flex: 1 }}>
              {t(section.title)}
            </Text>
          </View>
          <Text variant="body" tone="muted">
            {t(section.body)}
          </Text>
        </Card>
      ))}

      <InlineAlert
        tone="warning"
        title={t('legal.emergencyTitle')}
        message={t('legal.emergency')}
      />

      {kind === 'privacy' ? (
        <Text variant="caption" tone="subtle">
          {t('legal.privacy.prototype')}
        </Text>
      ) : null}

      <Button label={t('legal.close')} variant="outline" onPress={close} />
    </Screen>
  );
}
