// Valeur inhabituelle (L2-04, CDC F2 : « Cette valeur est inhabituelle, est-ce correct ? »).
// Elle apparaît quand on essaie d'enregistrer une valeur hors 20–600 mg/dL. Couleur « attention » (ambre),
// jamais le rouge : ce n'est pas une alarme, juste une vérification. Trois réponses possibles :
//  - « C'était en mmol/L » : si le même nombre a du sens dans une autre unité (erreur d'unité probable) ;
//  - « Corriger la valeur » : retour au champ, clavier ouvert ;
//  - « Oui, c'est correct » : la mesure est enregistrée avec `confirmedUnusual` (le serveur l'exige).
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { UNIT_LABELS, type GlucoseUnit } from '@glyka/shared';
import { Button, Text } from '@/components/ui';
import { durations, enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';
import { formatTyped, plausibleRange } from '../entry';

export function UnusualValueCard({
  text,
  unit,
  likely,
  saving,
  onSwitchUnit,
  onFix,
  onConfirm,
}: {
  /** Valeur telle que tapée (la personne relit exactement ce qu'elle a saisi). */
  text: string;
  /** Unité choisie à la saisie. */
  unit: GlucoseUnit;
  /** Autres unités dans lesquelles le même nombre serait plausible (voir `likelyUnits`). */
  likely: GlucoseUnit[];
  saving: boolean;
  onSwitchUnit: (unit: GlucoseUnit) => void;
  onFix: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const { colors, mode } = useTheme();
  const reduced = useReducedMotion();
  const range = plausibleRange(unit);
  // L'équivalent dans les autres unités est déjà affiché juste au-dessus, sous le champ (ValueField).
  const value = formatTyped(text, unit);

  return (
    <Animated.View
      entering={enterFromBelow(0, reduced)}
      exiting={reduced ? undefined : FadeOut.duration(durations.fast)}
      layout={reduced ? undefined : LinearTransition.duration(durations.base)}
    >
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        style={{
          gap: spacing.md,
          padding: spacing.lg,
          borderRadius: radii.lg,
          borderWidth: 1,
          borderColor: `${colors.warning}66`,
          backgroundColor: `${colors.warning}${mode === 'dark' ? '1F' : '12'}`,
        }}
      >
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Ionicons name="help-circle" size={24} color={colors.warning} style={{ marginTop: 1 }} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="heading" accessibilityRole="header">
              {t('measurement.unusual.question', { value })}
            </Text>
            <Text variant="bodySmall">
              {t('measurement.unusual.explain', { min: range.min, max: range.max })}
            </Text>
          </View>
        </View>

        {likely.length ? (
          <Animated.View
            entering={reduced ? undefined : FadeIn.delay(120).duration(durations.base)}
            style={{ gap: spacing.sm }}
          >
            <Text variant="label" tone="muted">
              {t('measurement.unusual.unitHint')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {likely.map((other) => (
                <Button
                  key={other}
                  label={t('measurement.unusual.switchUnit', { unit: UNIT_LABELS[other] })}
                  variant="secondary"
                  size="sm"
                  icon={<Ionicons name="swap-horizontal" size={16} color={colors.primaryText} />}
                  onPress={() => onSwitchUnit(other)}
                />
              ))}
            </View>
          </Animated.View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <Button
            label={t('measurement.unusual.confirm')}
            variant="outline"
            loading={saving}
            icon={<Ionicons name="checkmark" size={18} color={colors.text} />}
            onPress={onConfirm}
          />
          <Button label={t('measurement.unusual.fix')} variant="ghost" onPress={onFix} />
        </View>
      </View>
    </Animated.View>
  );
}
