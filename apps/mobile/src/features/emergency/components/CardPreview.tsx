// « Ce que verra le secouriste » (L6-06) : les champs renseignés de la carte, dans l'ordre de la page publique
// (même règle que le portail, previewLines). Un champ vide n'apparaît pas. Jamais d'état glycémique : la
// valeur est montrée telle quelle, avec un rappel de sa date de saisie.
import { Ionicons } from '@expo/vector-icons';
import type { EmergencyCardField, EmergencyCardResponse, GlucoseUnit } from '@glyka/shared';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { radii, spacing, useTheme } from '@/theme';
import { previewLines } from '../card';
import { formatLocale } from '@/i18n';

type IconName = ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<EmergencyCardField, IconName> = {
  fullName: 'person-outline',
  diabetesType: 'medkit-outline',
  declaredTreatment: 'bandage-outline',
  allergies: 'warning-outline',
  bloodGroup: 'water-outline',
  lastKnownGlucoseMgDl: 'pulse-outline',
  emergencyContactName: 'people-outline',
  emergencyContactPhone: 'call-outline',
};

export function CardPreview({
  card,
  unit,
  index = 0,
}: {
  card: EmergencyCardResponse;
  unit: GlucoseUnit;
  index?: number;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const lines = previewLines(card, unit);
  const updated = new Date(card.updatedAt).toLocaleDateString(formatLocale(i18n.language), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <Card variant="outlined" index={index} style={{ gap: spacing.md }}>
      <Text variant="subheading" accessibilityRole="header">
        {t('emergency.preview.title')}
      </Text>
      {lines.length === 0 ? (
        <Text tone="muted">{t('emergency.preview.empty')}</Text>
      ) : (
        lines.map(({ field, text }) => (
          <View
            key={field}
            style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}
            accessible
            accessibilityLabel={`${t(`emergency.field.${field}`)} : ${text}`}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: radii.sm,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surfaceMuted,
              }}
            >
              <Ionicons name={ICONS[field]} size={18} color={colors.primaryText} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="caption" tone="muted">
                {t(`emergency.field.${field}`)}
              </Text>
              <Text variant="bodyStrong">{text}</Text>
            </View>
          </View>
        ))
      )}
      <Text variant="caption" tone="muted">
        {t('emergency.preview.updated', { date: updated })}
      </Text>
    </Card>
  );
}
