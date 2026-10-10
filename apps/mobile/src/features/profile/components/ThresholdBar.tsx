// Aperçu visuel des seuils : une barre de 40 à 300 mg/dL découpée en 5 zones (très bas, bas, plage cible,
// haut, très haut), aux couleurs des états glycémiques (jamais rouge, ADR-0008). Les zones glissent quand
// la personne modifie un seuil. Chaque zone porte son symbole : l'état ne dépend pas de la couleur seule.
import { GLUCOSE_STATES, STATE_SYMBOLS, type GlucoseState } from '@glyka/shared';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { Text } from '@/components/ui';
import { durations, radii, spacing, useReducedMotion, useTheme } from '@/theme';
import type { ThresholdKey } from '../wizard';

const SCALE_MIN = 40;
const SCALE_MAX = 300;

export function ThresholdBar({ mgDl }: { mgDl: Record<ThresholdKey, number | null> }) {
  const { t } = useTranslation();
  const { states } = useTheme();
  const reduced = useReducedMotion();

  const { veryLowMgDl: a, targetMinMgDl: b, targetMaxMgDl: c, veryHighMgDl: d } = mgDl;
  // Aperçu seulement si les 4 seuils sont lisibles et dans l'ordre (sinon les erreurs des champs suffisent).
  if (a === null || b === null || c === null || d === null || !(a < b && b < c && c < d))
    return null;

  const clamp = (v: number) => Math.min(Math.max(v, SCALE_MIN), SCALE_MAX);
  const bounds = [SCALE_MIN, clamp(a), clamp(b), clamp(c), clamp(d), SCALE_MAX];
  // Largeur minimale : chaque zone reste assez large pour afficher son symbole, même étroite en mg/dL.
  const widths = GLUCOSE_STATES.map((_, i) => Math.max(bounds[i + 1]! - bounds[i]!, 26));

  return (
    <View
      accessible
      accessibilityLabel={t('onboarding.thresholds.barA11y', { min: b, max: c })}
      style={{ gap: spacing.xs }}
    >
      <View
        style={{
          flexDirection: 'row',
          height: 30,
          borderRadius: radii.sm,
          overflow: 'hidden',
          gap: 2,
        }}
      >
        {GLUCOSE_STATES.map((state: GlucoseState, i) => (
          <Animated.View
            key={state}
            layout={reduced ? undefined : LinearTransition.duration(durations.base)}
            style={{
              flex: widths[i],
              backgroundColor: states[state].bg,
              borderColor: states[state].border,
              borderWidth: 1,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="caption" style={{ color: states[state].fg }} numberOfLines={1}>
              {STATE_SYMBOLS[state].symbol}
            </Text>
          </Animated.View>
        ))}
      </View>
      <Text variant="caption" tone="muted" align="center">
        {t('onboarding.thresholds.barCaption')}
      </Text>
    </View>
  );
}
