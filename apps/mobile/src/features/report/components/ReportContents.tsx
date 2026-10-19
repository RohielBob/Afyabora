// « Ce que contient le rapport » (L6-03) : les parties du PDF (CDC F9), chacune avec son icône, pour que le
// patient sache ce qu'il va remettre avant de le partager. Les notes personnelles n'y sont jamais.
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { radii, spacing, useTheme } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Les parties du PDF, dans l'ordre du document (L6-01). */
export const REPORT_PARTS: { key: string; icon: IconName }[] = [
  { key: 'identity', icon: 'person-outline' },
  { key: 'quality', icon: 'checkmark-done-outline' },
  { key: 'ranges', icon: 'pie-chart-outline' },
  { key: 'episodes', icon: 'pulse-outline' },
  { key: 'points', icon: 'chatbubbles-outline' },
  { key: 'chart', icon: 'analytics-outline' },
];

export function ReportContents({ index = 0 }: { index?: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card variant="outlined" index={index} style={{ gap: spacing.md }}>
      <Text variant="subheading" accessibilityRole="header">
        {t('report.contents.title')}
      </Text>
      {REPORT_PARTS.map(({ key, icon }) => (
        <View key={key} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
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
            <Ionicons name={icon} size={18} color={colors.primaryText} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{t(`report.contents.${key}.title`)}</Text>
            <Text variant="bodySmall" tone="muted">
              {t(`report.contents.${key}.text`)}
            </Text>
          </View>
        </View>
      ))}
      <View
        style={{
          flexDirection: 'row',
          gap: spacing.xs,
          alignItems: 'flex-start',
          paddingTop: spacing.sm,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Ionicons
          name="lock-closed-outline"
          size={14}
          color={colors.textMuted}
          style={{ marginTop: 2 }}
        />
        <Text variant="caption" tone="muted" style={{ flex: 1 }}>
          {t('report.contents.private')}
        </Text>
      </View>
    </Card>
  );
}
