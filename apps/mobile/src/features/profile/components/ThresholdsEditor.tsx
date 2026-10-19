// Saisie de l'unité préférée, de la plage cible et des seuils d'alerte (L1-05) : utilisée par l'étape 3 de
// l'assistant de profil (L1-08) ET par Réglages → Unités et seuils. Valeurs affichées dans l'unité choisie
// (virgule ou point) ; changer d'unité convertit les valeurs. Mention « à définir avec votre médecin »,
// aperçu des 5 zones (ThresholdBar : couleur + symbole, jamais rouge), retour aux valeurs par défaut.
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { GlucoseUnit } from '@glyka/shared';
import { Button, Checkbox, ChoiceGroup, InlineAlert, Text, TextField } from '@/components/ui';
import { spacing } from '@/theme';
import {
  THRESHOLD_KEYS,
  convertThresholds,
  displayToMgDl,
  initialDraft,
  type ThresholdKey,
} from '../wizard';
import { ThresholdBar } from './ThresholdBar';

export const UNIT_LABEL: Record<GlucoseUnit, string> = {
  G_L: 'g/L',
  MG_DL: 'mg/dL',
  MMOL_L: 'mmol/L',
};

/** Seuils par défaut (@glyka/shared), affichés dans l'unité `unit`. */
export function defaultThresholdsIn(unit: GlucoseUnit): Record<ThresholdKey, string> {
  return convertThresholds(initialDraft().thresholds, 'G_L', unit);
}

export interface ThresholdsValue {
  unit: GlucoseUnit;
  thresholds: Record<ThresholdKey, string>;
  reviewed: boolean;
}

export function ThresholdsEditor({
  value,
  onChange,
  error,
}: {
  value: ThresholdsValue;
  /** Reçoit seulement ce qui change. */
  onChange: (patch: Partial<ThresholdsValue>) => void;
  /** Message d'erreur (déjà traduit) d'un champ, par chemin : « thresholds.veryLowMgDl ». */
  error: (path: string) => string | undefined;
}) {
  const { t } = useTranslation();
  const { unit, thresholds, reviewed } = value;
  const mgDl = useMemo(
    () =>
      Object.fromEntries(
        THRESHOLD_KEYS.map((key) => [key, displayToMgDl(thresholds[key], unit)]),
      ) as Record<ThresholdKey, number | null>,
    [thresholds, unit],
  );

  return (
    <>
      <ChoiceGroup
        label={t('onboarding.thresholds.unit')}
        value={unit}
        columns={3}
        onChange={(next) =>
          onChange({ unit: next, thresholds: convertThresholds(thresholds, unit, next) })
        }
        options={(['G_L', 'MG_DL', 'MMOL_L'] as const).map((option) => ({
          value: option,
          label: UNIT_LABEL[option],
        }))}
      />
      <InlineAlert tone="info" message={t('onboarding.thresholds.doctorNote')} />
      <ThresholdBar mgDl={mgDl} />
      {/* Deux groupes alignés : plage cible (de / à), puis seuils d'alerte (très bas / très haut). */}
      {(
        [
          ['rangeTitle', ['targetMinMgDl', 'targetMaxMgDl'], 'rangeHint'],
          ['alertTitle', ['veryLowMgDl', 'veryHighMgDl'], 'alertHint'],
        ] as const
      ).map(([title, keys, hint]) => (
        <View key={title} style={{ gap: spacing.sm }}>
          <Text variant="subheading">
            {t(`onboarding.thresholds.${title}`)} ({UNIT_LABEL[unit]})
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            {keys.map((key) => (
              <View key={key} style={{ flex: 1 }}>
                <TextField
                  label={t(`onboarding.thresholds.short.${key}`)}
                  value={thresholds[key]}
                  onChangeText={(text) => onChange({ thresholds: { ...thresholds, [key]: text } })}
                  error={error(`thresholds.${key}`)}
                  keyboardType="decimal-pad"
                  maxLength={6}
                />
              </View>
            ))}
          </View>
          <Text variant="caption" tone="muted">
            {t(`onboarding.thresholds.${hint}`)}
          </Text>
        </View>
      ))}
      <Button
        label={t('onboarding.thresholds.reset')}
        variant="ghost"
        onPress={() => onChange({ thresholds: defaultThresholdsIn(unit) })}
      />
      <Checkbox
        checked={reviewed}
        onChange={(next) => onChange({ reviewed: next })}
        label={t('onboarding.thresholds.reviewed')}
        accessibilityLabel={t('onboarding.thresholds.reviewed')}
      />
    </>
  );
}
