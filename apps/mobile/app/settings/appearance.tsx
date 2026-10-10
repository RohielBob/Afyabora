// Réglages → Apparence (ADR-0008) : thème clair (par défaut), sombre ou automatique, et couleur d'accent
// parmi des thèmes préparés. L'aperçu se met à jour immédiatement ; le choix est mémorisé sur le téléphone.
import { useTranslation } from 'react-i18next';
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

const MODES: readonly ThemePreference[] = ['light', 'dark', 'system'];

export default function AppearanceScreen() {
  const { t } = useTranslation();
  const { mode } = useTheme();
  const { preference, accent, setPreference, setAccent } = useAppearance();

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Text variant="overline" tone="primary">
          {t('appearance.overline')}
        </Text>
        <Text variant="title">{t('appearance.title')}</Text>
        <Text tone="muted">{t('appearance.intro')}</Text>
      </View>

      <View style={{ gap: spacing.md }}>
        <Text variant="subheading">{t('appearance.theme')}</Text>
        <SegmentedControl
          accessibilityLabel={t('appearance.themeA11y')}
          options={MODES.map((value) => ({ value, label: t(`appearance.${value}`) }))}
          value={preference}
          onChange={setPreference}
        />
        {preference === 'system' ? (
          <Text variant="caption" tone="muted">
            {t('appearance.systemHint', {
              mode: t(mode === 'dark' ? 'appearance.systemDark' : 'appearance.systemLight'),
            })}
          </Text>
        ) : null}
      </View>

      <View style={{ gap: spacing.md }}>
        <Text variant="subheading">{t('appearance.accent')}</Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('appearance.accent')}
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
        <Text variant="subheading">{t('appearance.preview')}</Text>
        <Card index={2}>
          <Text variant="overline" tone="primary">
            {t('appearance.previewOverline')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
            <Text variant="metric">1,12</Text>
            <Text variant="subheading" tone="muted">
              g/L
            </Text>
          </View>
          <RangeBadge state="IN_RANGE" />
          <View style={{ height: spacing.sm }} />
          <Button label={t('appearance.previewButton')} onPress={() => undefined} />
        </Card>
      </View>
    </Screen>
  );
}
