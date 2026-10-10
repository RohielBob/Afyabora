// Filtres de la chronologie (CDC F4) : tout, glycémie, repas, activité, traitements, alertes.
// Une rangée de pastilles qui défile horizontalement ; chacune = icône + libellé (jamais la couleur seule).
// La pastille choisie prend la teinte d'accent et le lecteur d'écran l'annonce « sélectionnée ».
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { PressableScale, Text } from '@/components/ui';
import { radii, spacing, useTheme } from '@/theme';
import { TIMELINE_FILTERS, type TimelineFilter } from '../timeline';

export const FILTER_ICON: Record<TimelineFilter, keyof typeof Ionicons.glyphMap> = {
  all: 'list',
  glucose: 'water',
  MEAL: 'restaurant',
  ACTIVITY: 'walk',
  TREATMENT: 'medkit',
  alerts: 'alert-circle',
};

export function FilterChips({
  value,
  onChange,
}: {
  value: TimelineFilter;
  onChange: (filter: TimelineFilter) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel={t('timeline.filtersLabel')}
      contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}
    >
      {TIMELINE_FILTERS.map((filter) => {
        const selected = filter === value;
        return (
          <PressableScale
            key={filter}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={t(`timeline.filter.${filter}`)}
            onPress={() => onChange(filter)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs + 2,
              minHeight: 40,
              paddingHorizontal: spacing.md,
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: selected ? colors.primarySoftBorder : colors.border,
              backgroundColor: selected ? colors.primarySoft : colors.surface,
            }}
          >
            <Ionicons
              name={FILTER_ICON[filter]}
              size={16}
              color={selected ? colors.primaryText : colors.textMuted}
            />
            <Text
              variant="label"
              style={{ color: selected ? colors.primaryText : colors.text }}
              numberOfLines={1}
            >
              {t(`timeline.filter.${filter}`)}
            </Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}
