// Choix unique parmi quelques options (sexe, type de diabète, unité…) : des « pastilles » larges, faciles à
// toucher. L'option choisie est teintée et porte une coche (couleur + forme + texte). Accessible comme des
// boutons radio. Peut afficher une erreur sous le groupe.
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { durations, radii, spacing, useReducedMotion, useTheme } from '@/theme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface Choice<T extends string> {
  value: T;
  label: string;
  /** Petite précision sous le libellé (facultatif). */
  hint?: string;
}

export function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  columns = 2,
}: {
  label: string;
  options: readonly Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string;
  /** Nombre de pastilles par ligne. */
  columns?: 1 | 2 | 3;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="label">{label}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <PressableScale
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              // Sur le web, `accessibilityState` ne produit pas `aria-checked` (vérifié dans le navigateur) : on le
              // donne aussi directement, pour que le lecteur d'écran dise quelle option est choisie.
              aria-checked={selected}
              accessibilityLabel={option.hint ? `${option.label}, ${option.hint}` : option.label}
              onPress={() => onChange(option.value)}
              style={{
                // Largeur d'une colonne, espacement compris.
                width: `${100 / columns - (columns > 1 ? 2 : 0)}%`,
                flexGrow: 1,
                minHeight: 52,
                flexDirection: 'row',
                alignItems: 'center',
                paddingLeft: columns === 3 ? spacing.sm : spacing.md,
                paddingRight: columns === 3 ? spacing.md : spacing.lg, // place pour la coche du coin
                paddingVertical: spacing.sm,
                borderRadius: radii.md,
                borderWidth: selected ? 2 : 1,
                borderColor: selected
                  ? colors.primary
                  : error
                    ? colors.danger
                    : colors.borderStrong,
                backgroundColor: selected ? colors.primarySoft : colors.surface,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  // Pastilles étroites (3 par ligne) : texte un peu plus petit pour ne pas être coupé.
                  variant={columns === 3 ? 'label' : 'bodyStrong'}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ color: selected ? colors.primaryText : colors.text }}
                >
                  {option.label}
                </Text>
                {option.hint ? (
                  <Text variant="caption" tone="muted">
                    {option.hint}
                  </Text>
                ) : null}
              </View>
              {/* Coche dans le coin : elle ne prend pas de place au libellé (pas de « Fem / me »). */}
              {selected ? (
                <Animated.View
                  entering={reduced ? undefined : ZoomIn.duration(durations.fast)}
                  style={{ position: 'absolute', top: 5, right: 5 }}
                >
                  <Ionicons name="checkmark-circle" size={16} color={colors.primaryText} />
                </Animated.View>
              ) : null}
            </PressableScale>
          );
        })}
      </View>
      {error ? (
        <Text variant="caption" tone="danger">
          ⚠ {error}
        </Text>
      ) : null}
    </View>
  );
}
