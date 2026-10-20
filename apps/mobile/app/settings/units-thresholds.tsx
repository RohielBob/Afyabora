// Réglages → Unités et seuils (L1-05, CDC F1) : unité préférée, plage cible, seuils d'alerte et case
// « définis avec mon médecin ». Même saisie que l'étape 3 de l'assistant de profil (ThresholdsEditor).
// Mention « à définir avec votre médecin » : Afyabora ne donne jamais de conseil de traitement.
// Le réseau est nécessaire (le profil est sur le serveur) ; les mesures déjà enregistrées ne changent
// jamais (stockées en mg/dL, ADR-0002) : seul leur affichage suit l'unité choisie.
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Button, Card, InlineAlert, Screen, SkeletonCard, Text } from '@/components/ui';
import { ThresholdsEditor, UNIT_LABEL, useUnitsSettings } from '@/features/profile';
import { enterFromBelow, spacing, useReducedMotion } from '@/theme';

export default function SettingsUnitsScreen() {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const { state, change, save, discard, retry, changed } = useUnitsSettings();

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Text variant="overline" tone="primary">
          {t('settings.title')}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {t('settings.units')}
        </Text>
        <Text tone="muted">{t('settings.unitsScreen.intro')}</Text>
      </View>

      {state.status === 'loading' ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : null}

      {state.status === 'failed' ? (
        <Animated.View entering={enterFromBelow(0, reduced)} style={{ gap: spacing.md }}>
          <InlineAlert tone="danger" message={t(`settings.unitsScreen.problem.${state.problem}`)} />
          {state.problem !== 'noProfile' ? (
            <Button label={t('common.retry')} variant="outline" onPress={() => void retry()} />
          ) : null}
        </Animated.View>
      ) : null}

      {state.status === 'ready' ? (
        <>
          <Card variant="outlined" index={0}>
            <ThresholdsEditor
              value={state.draft}
              onChange={change}
              error={(path) => (state.errors[path] ? t(state.errors[path]!) : undefined)}
            />
          </Card>

          {state.errors.profile ? (
            <InlineAlert tone="danger" message={t(state.errors.profile)} />
          ) : null}
          {state.problem ? (
            <InlineAlert
              tone="danger"
              message={t(`settings.unitsScreen.problem.${state.problem}`)}
            />
          ) : null}
          {state.saved ? (
            <InlineAlert
              tone="success"
              message={t('settings.unitsScreen.saved', {
                unit: UNIT_LABEL[state.profile.preferredUnit],
              })}
            />
          ) : null}

          <View style={{ gap: spacing.sm }}>
            <Button
              label={t('common.save')}
              loading={state.saving}
              disabled={!changed}
              onPress={() => void save()}
            />
            {changed && !state.saving ? (
              <Animated.View entering={enterFromBelow(0, reduced)}>
                <Button
                  label={t('settings.unitsScreen.discard')}
                  variant="ghost"
                  onPress={discard}
                />
              </Animated.View>
            ) : null}
          </View>
          <Text variant="caption" tone="muted" align="center">
            {t('settings.unitsScreen.storedNote')}
          </Text>
        </>
      ) : null}
    </Screen>
  );
}
