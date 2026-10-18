// Badge de provenance d'une mesure (CDC F4, « badge de provenance sur chaque mesure ») : saisie à la main,
// importée (avec son lot, CA : « un élément importé affiche son lot d'import ») ou venue d'un appareil.
// Pastille neutre : icône + texte. La règle (lot court, seulement pour un import) est dans @glyka/shared :
// le portail du médecin affiche exactement la même chose (L4-09).
import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { provenanceOf, type MeasurementSource } from '@glyka/shared';
import { Text } from '@/components/ui';
import { radii, spacing, useTheme } from '@/theme';

const ICON: Record<MeasurementSource, keyof typeof Ionicons.glyphMap> = {
  MANUAL: 'create-outline',
  IMPORT: 'document-text-outline',
  DEVICE: 'hardware-chip-outline',
};

/** « Saisie », « Import », « Import · lot 3F2A1C », « Appareil » (aussi pour les lecteurs d'écran). */
export function provenanceText(
  t: TFunction,
  source: MeasurementSource,
  importBatchId: string | null,
): string {
  const { batch } = provenanceOf(source, importBatchId);
  return batch ? t('timeline.source.importBatch', { batch }) : t(`timeline.source.${source}`);
}

export function ProvenanceBadge({
  source,
  importBatchId,
}: {
  source: MeasurementSource;
  importBatchId: string | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const label = provenanceText(t, source, importBatchId);

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
