// Réglages → Apparence (ADR-0008) : thème clair (par défaut), sombre ou automatique, et couleur d'accent
// parmi des thèmes préparés. L'aperçu se met à jour immédiatement ; le choix est mémorisé sur le téléphone.
import { View } from 'react-native';
import {
  Button,
  Card,
  ColorSwatch,
  RangeBadge,
  Screen,
  SegmentedControl,
  Text,
} from '@/components/ui';
import {
  ACCENT_LABELS,
  ACCENT_NAMES,
  buildTheme,
  spacing,
  useAppearance,
  useTheme,
  type ThemePreference,
} from '@/theme';

const MODES = [
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
  { value: 'system', label: 'Automatique' },
] as const satisfies readonly { value: ThemePreference; label: string }[];

export default function AppearanceScreen() {
  const { mode } = useTheme();
  const { preference, accent, setPreference, setAccent } = useAppearance();

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Text variant="overline" tone="primary">
          Paramètres
        </Text>
        <Text variant="title">Apparence</Text>
        <Text tone="muted">
          Choisissez l'ambiance d'Afyabora. Les textes restent toujours lisibles.
        </Text>
      </View>

      <View style={{ gap: spacing.md }}>
        <Text variant="subheading">Thème</Text>
        <SegmentedControl
          accessibilityLabel="Thème de l'application"
          options={MODES}
          value={preference}
          onChange={setPreference}
        />
        {preference === 'system' ? (
          <Text variant="caption" tone="muted">
            Suit le réglage du téléphone (actuellement : {mode === 'dark' ? 'sombre' : 'clair'}).
          </Text>
        ) : null}
      </View>

      <View style={{ gap: spacing.md }}>
        <Text variant="subheading">Couleur d'accent</Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Couleur d'accent"
          style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}
        >
          {ACCENT_NAMES.map((name) => (
            <ColorSwatch
              key={name}
              // Pastille = couleur du bouton principal de ce thème, dans le mode affiché.
              color={buildTheme(mode, name).colors.primary}
              label={ACCENT_LABELS[name]}
              selected={accent === name}
              onPress={() => setAccent(name)}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.md }}>
        <Text variant="subheading">Aperçu</Text>
        <Card index={2}>
          <Text variant="overline" tone="primary">
            Dernière mesure · exemple
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
            <Text variant="metric">1,12</Text>
            <Text variant="subheading" tone="muted">
              g/L
            </Text>
          </View>
          <RangeBadge state="IN_RANGE" />
          <View style={{ height: spacing.sm }} />
          <Button label="Ajouter une mesure" onPress={() => undefined} />
        </Card>
      </View>
    </Screen>
  );
}
