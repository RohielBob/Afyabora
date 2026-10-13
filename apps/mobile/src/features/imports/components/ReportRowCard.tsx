// Une ligne non valide du rapport (L4-07) : « Ligne 42 · 18,70 », la raison donnée par le serveur
// (« Valeur inhabituelle, vérifier l'unité (en mmol/L ?) »), puis la décision : Ignorer · Accepter ·
// Corriger. Corriger ouvre la saisie de la bonne valeur et de son unité, vérifiée tout de suite.
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { GLUCOSE_UNITS, UNIT_LABELS, type GlucoseUnit, type ImportRowReport } from '@glyka/shared';
import { InlineAlert, SegmentedControl, Text, TextField } from '@/components/ui';
import { radii, spacing, useTheme } from '@/theme';
import { allowedActions, type CorrectionProblem, type RowChoice } from '../report';

export function ReportRowCard({
  row,
  choice,
  defaultUnit,
  problem,
  serverError,
  disabled,
  onChange,
}: {
  row: ImportRowReport;
  choice: RowChoice | undefined;
  defaultUnit: GlucoseUnit;
  /** Problème de la valeur corrigée (vérifiée sur le téléphone). */
  problem?: CorrectionProblem;
  /** Refus du serveur pour cette ligne. */
  serverError?: string;
  disabled: boolean;
  onChange: (choice: RowChoice) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const action = choice?.action ?? 'IGNORE';
  const unit = choice?.unit ?? defaultUnit;

  return (
    <View
      style={{
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
        <Text variant="label">{t('import.report.line', { line: row.line })}</Text>
        <Text variant="bodyStrong" style={{ flexShrink: 1 }} numberOfLines={1}>
          {row.rawValue || t('import.report.empty')}
        </Text>
      </View>
      {row.message ? (
        <Text variant="bodySmall" tone="muted">
          {row.message}
        </Text>
      ) : null}

      <SegmentedControl
        accessibilityLabel={t('import.report.decisionFor', { line: row.line })}
        options={allowedActions(row.status).map((value) => ({
          value,
          label: t(`import.report.action.${value}`),
        }))}
        value={action}
        onChange={(next) =>
          disabled
            ? undefined
            : onChange({ action: next, value: choice?.value, unit: choice?.unit })
        }
      />

      {action === 'CORRECT' ? (
        <View style={{ gap: spacing.sm }}>
          <TextField
            label={t('import.report.correctedValue')}
            value={choice?.value ?? ''}
            onChangeText={(value) => onChange({ action, value, unit: choice?.unit })}
            keyboardType="decimal-pad"
            editable={!disabled}
            hint={t('import.report.correctedHint', { unit: UNIT_LABELS[unit] })}
            error={problem ? t(`import.report.problem.${problem}`) : undefined}
          />
          <SegmentedControl
            accessibilityLabel={t('import.report.correctedUnit')}
            options={GLUCOSE_UNITS.map((u) => ({ value: u, label: UNIT_LABELS[u] }))}
            value={unit}
            onChange={(next) =>
              disabled ? undefined : onChange({ action, value: choice?.value, unit: next })
            }
          />
        </View>
      ) : null}

      {serverError ? <InlineAlert tone="danger" message={serverError} /> : null}
    </View>
  );
}
