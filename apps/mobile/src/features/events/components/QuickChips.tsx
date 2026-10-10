// Choix rapides en un appui (L2-10) : suggestions de libellé (« Déjeuner », « Marche »…) et durées
// (« 30 min »). Une rangée de pastilles qui passe à la ligne ; la pastille qui correspond à la saisie
// actuelle est teintée (couleur + coche), le reste du champ reste modifiable à la main.
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { PressableScale, Text } from '@/components/ui';
import { radii, spacing, useTheme } from '@/theme';

export function QuickChips({
  options,
  selected,
  onPick,
  accessibilityLabel,
}: {
  options: readonly { value: string; label: string }[];
  /** Valeur actuellement choisie (comparée au libellé ou à la durée tapée). */
  selected: string;
  onPick: (value: string) => void;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}
    >
      {options.map((option) => {
        const active = option.value === selected;
        return (
          <PressableScale
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
            onPress={() => onPick(option.value)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              minHeight: 36,
              paddingHorizontal: spacing.md,
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: active ? colors.primarySoftBorder : colors.border,
              backgroundColor: active ? colors.primarySoft : colors.surface,
            }}
          >
            {active ? <Ionicons name="checkmark" size={14} color={colors.primaryText} /> : null}
            <Text variant="bodySmall" style={{ color: active ? colors.primaryText : colors.text }}>
              {option.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
