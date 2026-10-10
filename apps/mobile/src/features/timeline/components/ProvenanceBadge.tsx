// Badge de provenance d'une mesure (CDC F4, « badge de provenance sur chaque mesure ») : saisie à la main,
// importée (avec son lot, CA : « un élément importé affiche son lot d'import ») ou venue d'un appareil.
// Pastille neutre : icône + texte. L4-09 la reprendra pour le portail du médecin.
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { MeasurementSource } from '@glyka/shared';
import { Text } from '@/components/ui';
import { radii, spacing, useTheme } from '@/theme';
import { shortBatchId } from '../timeline';

const ICON: Record<MeasurementSource, keyof typeof Ionicons.glyphMap> = {
  MANUAL: 'create-outline',
  IMPORT: 'document-text-outline',
  DEVICE: 'hardware-chip-outline',
};

export function ProvenanceBadge({
  source,
  importBatchId,
}: {
  source: MeasurementSource;
  importBatchId: string | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const label =
    source === 'IMPORT' && importBatchId
      ? t('timeline.source.importBatch', { batch: shortBatchId(importBatchId) })
      : t(`timeline.source.${source}`);

  return (
    <View
      accessible
      accessibilityLabel={t('timeline.source.a11y', { label })}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: radii.pill,
        backgroundColor: colors.surfaceMuted,
      }}
    >
      <Ionicons name={ICON[source]} size={12} color={colors.textMuted} />
      <Text variant="caption" tone="muted" style={{ fontSize: 11 }}>
        {label}
      </Text>
    </View>
  );
}
