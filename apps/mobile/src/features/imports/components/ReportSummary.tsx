// Résumé du rapport d'import (L4-07) : « 147 lignes analysées » puis quatre cases (valides, doublons,
// incohérentes, erreurs). Chaque case a sa couleur ET son icône ET son libellé : jamais la couleur seule.
// Ce ne sont pas des états de glycémie (palette des états non utilisée).
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { ImportReport } from '@glyka/shared';
import { Text } from '@/components/ui';
import { radii, spacing, useTheme } from '@/theme';
import { formatLocale } from '@/i18n';

type Tone = 'success' | 'info' | 'warning' | 'danger';

const TILES: readonly {
  key: 'valid' | 'duplicates' | 'inconsistent' | 'errors';
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
}[] = [
  { key: 'valid', icon: 'checkmark-circle-outline', tone: 'success' },
  { key: 'duplicates', icon: 'copy-outline', tone: 'info' },
  { key: 'inconsistent', icon: 'alert-circle-outline', tone: 'warning' },
  { key: 'errors', icon: 'close-circle-outline', tone: 'danger' },
];

export function ReportSummary({ report }: { report: ImportReport }) {
  const { t, i18n } = useTranslation();
  const { colors, mode } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <Text variant="label" tone="muted">
        {t('import.report.analyzed', { count: report.analyzed })}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {TILES.map(({ key, icon, tone }) => {
          const count = report[key];
          const fg = colors[tone];
          return (
            <View
              key={key}
              accessible
              accessibilityLabel={t(`import.report.tile.${key}`, { count })}
              style={{
                width: '48%',
                flexGrow: 1,
                gap: spacing.xs,
                padding: spacing.md,
                borderRadius: radii.md,
                borderWidth: 1,
                borderColor: colors.border,
                // Fond très léger de la couleur du libellé (comme les messages).
                backgroundColor:
                  count > 0 ? `${fg}${mode === 'dark' ? '1F' : '12'}` : colors.surface,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Ionicons name={icon} size={18} color={count > 0 ? fg : colors.textMuted} />
                <Text variant="label" tone="muted">
                  {t(`import.report.label.${key}`)}
                </Text>
              </View>
              <Text variant="title" style={count > 0 ? { color: fg } : undefined}>
                {count.toLocaleString(formatLocale(i18n.language))}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
