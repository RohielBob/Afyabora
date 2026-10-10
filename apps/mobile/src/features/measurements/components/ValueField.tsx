// Grand champ de la valeur (L2-03) : gros chiffres (style « metric » des jetons), unité à côté, clavier
// numérique ouvert tout de suite. En dessous, la conversion en direct (« soit 148 mg/dL · 8,2 mmol/L »),
// qui apparaît en fondu ; en cas d'erreur, le cadre et le message passent en couleur d'erreur (+ symbole).
// Valeur inhabituelle en attente de réponse (L2-04) : cadre couleur « attention », la question est posée
// juste en dessous par UnusualValueCard.
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { UNIT_LABELS, type GlucoseUnit } from '@glyka/shared';
import { Text, textStyle } from '@/components/ui';
import { durations, radii, spacing, useReducedMotion, useTheme } from '@/theme';
import { formatReading, otherUnits } from '../entry';

export const ValueField = forwardRef<
  TextInput,
  {
    text: string;
    onChangeText: (text: string) => void;
    unit: GlucoseUnit;
    /** Valeur convertie en mg/dL, ou null si la saisie n'est pas (encore) lisible. */
    mgDl: number | null;
    error?: string;
    /** Valeur inhabituelle en attente de confirmation (L2-04). */
    attention?: boolean;
  }
>(function ValueField({ text, onChangeText, unit, mgDl, error, attention = false }, ref) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const metric = textStyle('metric');
  const placeholder = unit === 'G_L' ? '0,00' : unit === 'MMOL_L' ? '0,0' : '0';
  const conversion =
    mgDl !== null
      ? otherUnits(unit)
          .map((u) => formatReading(mgDl, u)) // « 1 870 mg/dL » : milliers séparés
          .join(' · ')
      : null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="label" tone="muted">
        {t('measurement.valueLabel')}
      </Text>
      <Pressable
        // Toucher n'importe où dans le cadre ouvre le clavier.
        onPress={() => (typeof ref === 'object' ? ref?.current?.focus() : undefined)}
        accessible={false}
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'center',
          gap: spacing.sm,
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.xl,
          borderRadius: radii.xl,
          borderWidth: 2,
          borderColor: error ? colors.danger : attention ? colors.warning : colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <TextInput
          ref={ref}
          value={text}
          onChangeText={(value) => onChangeText(value.replace(/[^0-9.,]/g, ''))}
          keyboardType="decimal-pad"
          inputMode="decimal"
          autoFocus
          maxLength={6}
          placeholder={placeholder}
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.primary}
          accessibilityLabel={t('measurement.valueA11y', { unit: UNIT_LABELS[unit] })}
          accessibilityHint={error}
          style={[
            metric,
            {
              color: colors.text,
              minWidth: 120,
              textAlign: 'center',
              padding: 0,
              // Pas de cadre bleu/orange du navigateur (aperçu web).
              outlineStyle: 'none',
            } as object,
          ]}
        />
        <Text variant="heading" tone="muted">
          {UNIT_LABELS[unit]}
        </Text>
      </Pressable>
      <View style={{ minHeight: 20, alignItems: 'center' }}>
        {error ? (
          <Animated.View
            key="error"
            entering={reduced ? undefined : FadeIn.duration(durations.fast)}
          >
            <Text variant="bodySmall" tone="danger" align="center">
              ⚠ {error}
            </Text>
          </Animated.View>
        ) : conversion ? (
          <Animated.View
            key={conversion}
            entering={reduced ? undefined : FadeIn.duration(durations.fast)}
            exiting={reduced ? undefined : FadeOut.duration(durations.instant)}
          >
            <Text variant="bodySmall" tone="muted" align="center">
              {t('measurement.equals', { values: conversion })}
            </Text>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
});
