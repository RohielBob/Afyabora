// Message de sécurité (L2-04, CDC F2) quand la mesure franchit le seuil « très bas » ou « très haut » du
// patient. Sobre et sans alarme : couleur de l'état (jamais le rouge de la marque) + symbole (▼▼ / ▲▲) +
// titre en toutes lettres, puis le texte du cahier des charges. AUCUNE consigne de traitement ni de dose.
// Le badge d'état complet est déjà sur la carte de résumé juste au-dessus : on ne le répète pas.
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { STATE_SYMBOLS } from '@glyka/shared';
import { Text } from '@/components/ui';
import { enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';
import type { SafetyLevel } from '../entry';

export function SafetyNotice({ level, delay = 0 }: { level: SafetyLevel; delay?: number }) {
  const { t } = useTranslation();
  const { colors, states } = useTheme();
  const reduced = useReducedMotion();
  const accent = states[level];

  return (
    <Animated.View entering={enterFromBelow(delay, reduced)}>
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        style={{
          flexDirection: 'row',
          overflow: 'hidden',
          borderRadius: radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        {/* Bande de la couleur de l'état : un repère, jamais le seul (symbole + titre à côté). */}
        <View style={{ width: 5, backgroundColor: accent.bg }} />
        <View style={{ flex: 1, gap: spacing.sm, padding: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View
              // Le symbole est décoratif pour le lecteur d'écran : le titre dit déjà « très haute ».
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
              style={{
                minWidth: 32,
                height: 24,
                paddingHorizontal: spacing.xs,
                borderRadius: radii.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: accent.bg,
                borderWidth: 1,
                borderColor: accent.border,
              }}
            >
              <Text variant="caption" style={{ color: accent.fg, fontSize: 10 }}>
                {STATE_SYMBOLS[level].symbol}
              </Text>
            </View>
            <Text variant="heading" style={{ flexShrink: 1 }}>
              {t(`measurement.safety.title.${level}`)}
            </Text>
          </View>
          <Text variant="bodySmall">{t('measurement.safety.message')}</Text>
        </View>
      </View>
    </Animated.View>
  );
}
