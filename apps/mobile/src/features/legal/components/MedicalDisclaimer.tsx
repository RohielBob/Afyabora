// Avertissement « outil d'aide, pas un avis médical » (L1-10), réutilisable partout où l'app montre des
// chiffres ou des observations (accueil, résumé du profil, À propos, puis tableau de bord et analyses).
//  - `card`    : carte avec icône, titre, phrase courte et lien « En savoir plus » ;
//  - `compact` : une phrase discrète + le lien (ex. bas de l'écran d'accueil).
// Jamais en rouge : c'est une information, pas une erreur (carte neutre à bordure, en clair comme en
// sombre ; seule l'icône porte la couleur d'accent). Le lien ouvre la page complète.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { spacing, useTheme } from '@/theme';

export function MedicalDisclaimer({
  variant = 'card',
  index = 0,
}: {
  variant?: 'card' | 'compact';
  /** Rang d'apparition (cartes qui entrent l'une après l'autre). */
  index?: number;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const open = () => router.push('/legal/disclaimer');

  const link = (
    <Text
      variant="label"
      tone="primary"
      accessibilityRole="link"
      accessibilityLabel={t('legal.disclaimer.moreA11y')}
      onPress={open}
      suppressHighlighting
    >
      {t('legal.disclaimer.more')}
    </Text>
  );

  if (variant === 'compact') {
    return (
      <View style={{ alignItems: 'center', gap: spacing.xs }}>
        <Text variant="caption" tone="muted" align="center">
          {t('legal.disclaimer.short')}
        </Text>
        {link}
      </View>
    );
  }

  return (
    <Card variant="outlined" index={index}>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        <Ionicons
          name="medkit-outline"
          size={22}
          color={colors.primaryText}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="subheading">{t('legal.disclaimer.title')}</Text>
          <Text variant="bodySmall" tone="muted">
            {t('legal.disclaimer.short')}
          </Text>
          {link}
        </View>
      </View>
    </Card>
  );
}
