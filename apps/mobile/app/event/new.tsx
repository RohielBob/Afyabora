// Ajout rapide d'un événement (L2-10, CDC F4) : repas, activité ou traitement DÉCLARÉ.
// Ordre de l'écran = ordre de la saisie : type (trois tuiles) → libellé (avec suggestions en un appui)
// → durée (activité) → quand ? (maintenant par défaut) → détails facultatifs → Enregistrer.
// Écriture LOCALE d'abord (ADR-0004, L8-03) : l'événement et son opération de synchronisation sont gardés
// sur le téléphone. Traitement : on enregistre ce que la personne déclare, JAMAIS de calcul de dose.
// Le type peut être choisi à l'avance par l'adresse (« /event/new?type=MEAL », depuis l'Historique filtré).
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { LifeEventType } from '@glyka/shared';
import { Button, InlineAlert, PressableScale, Screen, Text, TextField } from '@/components/ui';
import {
  DETAILS_MAX,
  DURATION_PRESETS,
  EventSaved,
  LABEL_MAX,
  LABEL_SUGGESTIONS,
  QuickChips,
  TypeTiles,
  localEvents,
  parseEventType,
  toCreateEventInput,
  validateEvent,
  type EventDraft,
} from '@/features/events';
import { WhenPicker, formatClock, initialWhen, resolveWhen } from '@/features/measurements';
import { durations, enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';

function newDraft(type: LifeEventType | null): EventDraft {
  return { type, label: '', details: '', duration: '', when: initialWhen(new Date()) };
}

export default function NewEventScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const params = useLocalSearchParams<{ type?: string }>();

  const [draft, setDraft] = useState<EventDraft>(() => newDraft(parseEventType(params.type)));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState<{ type: LifeEventType; label: string; detail: string } | null>(
    null,
  );

  const update = (patch: Partial<EventDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setFailed(false);
  };

  // Suggestions du type choisi, traduites (« Déjeuner », « Marche »…).
  const suggestions = (type: LifeEventType | null) =>
    type ? LABEL_SUGGESTIONS[type].map((key) => t(`event.suggestion.${key}`)) : [];

  const chooseType = (type: LifeEventType) => {
    // Un libellé SUGGÉRÉ pour l'ancien type n'a plus de sens (« Déjeuner » pour une activité) : on
    // l'efface. Un libellé tapé à la main est gardé.
    const keepLabel = !suggestions(draft.type).includes(draft.label.trim());
    update({ type, label: keepLabel ? draft.label : '', duration: '' });
  };

  const errors = submitted ? validateEvent(draft, new Date()) : {};

  /** « Aujourd'hui, 18:00 » pour l'écran de réussite. */
  const describeWhen = (date: Date) => {
    const today = new Date();
    const day =
      date.toDateString() === today.toDateString()
        ? t('measurement.when.today')
        : date.toDateString() === new Date(today.getTime() - 86_400_000).toDateString()
          ? t('measurement.when.yesterday')
          : t('measurement.when.dayBefore');
    return t('measurement.when.summary', {
      day,
      time: formatClock(date.getHours(), date.getMinutes()),
    });
  };

  const save = async () => {
    setSubmitted(true);
    const now = new Date();
    if (Object.keys(validateEvent(draft, now)).length) return;
    const input = toCreateEventInput(draft, now);
    setSaving(true);
    try {
      await localEvents.save(input);
      const parts = [t(`event.type.${input.type}`)];
      if (input.durationMinutes) parts.push(t('event.minutes', { count: input.durationMinutes }));
      parts.push(describeWhen(resolveWhen(draft.when, now)));
      setSaved({ type: input.type, label: input.label, detail: parts.join(' · ') });
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/timeline'));

  if (saved) {
    return (
      <Screen>
        <EventSaved
          type={saved.type}
          label={saved.label}
          detail={saved.detail}
          onDone={close}
          onAnother={() => {
            setSaved(null);
            setSubmitted(false);
            setDraft(newDraft(saved.type));
          }}
        />
      </Screen>
    );
  }

  const type = draft.type;

  return (
    <Screen>
      {/* En-tête : titre + fermer (sans enregistrer). */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="overline" tone="primary">
            {t('event.overline')}
          </Text>
          <Text variant="title" accessibilityRole="header">
            {t('event.title')}
          </Text>
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('event.close')}
          onPress={close}
          style={{
            width: 44,
            height: 44,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceMuted,
          }}
        >
          <Ionicons name="close" size={22} color={colors.text} />
        </PressableScale>
      </View>

      <Animated.View entering={enterFromBelow(0, reduced)}>
        <TypeTiles value={type} onChange={chooseType} error={errors.type && t(errors.type)} />
      </Animated.View>

      {type ? (
        // Le reste du formulaire apparaît une fois le type choisi (et change avec lui).
        <Animated.View
          key={type}
          entering={reduced ? undefined : FadeIn.duration(durations.base)}
          style={{ gap: spacing.xl }}
        >
          <View style={{ gap: spacing.sm }}>
            <TextField
              label={t(`event.label.${type}`)}
              placeholder={t(`event.placeholder.${type}`)}
              value={draft.label}
              onChangeText={(label) => update({ label })}
              maxLength={LABEL_MAX}
              error={errors.label && t(errors.label, { max: LABEL_MAX })}
              returnKeyType="next"
            />
            {suggestions(type).length ? (
              <QuickChips
                accessibilityLabel={t('event.suggestionsLabel')}
                options={suggestions(type).map((label) => ({ value: label, label }))}
                selected={draft.label.trim()}
                onPick={(label) => update({ label })}
              />
            ) : null}
          </View>

          {type === 'ACTIVITY' ? (
            <View style={{ gap: spacing.sm }}>
              <Text variant="label" tone="muted">
                {t('event.durationLabel')}
              </Text>
              <QuickChips
                accessibilityLabel={t('event.durationLabel')}
                options={DURATION_PRESETS.map((minutes) => ({
                  value: `${minutes}`,
                  label: t('event.minutes', { count: minutes }),
                }))}
                selected={draft.duration.trim()}
                onPick={(duration) => update({ duration })}
              />
              <TextField
                label={t('event.durationOther')}
                placeholder="40"
                keyboardType="number-pad"
                inputMode="numeric"
                value={draft.duration}
                onChangeText={(duration) => update({ duration: duration.replace(/[^0-9]/g, '') })}
                maxLength={4}
                error={errors.duration && t(errors.duration)}
              />
            </View>
          ) : null}

          <WhenPicker
            when={draft.when}
            onChange={(when) => update({ when })}
            error={errors.when && t(errors.when)}
          />

          {type === 'TREATMENT' ? (
            <InlineAlert
              tone="info"
              title={t('event.treatmentTitle')}
              message={t('event.treatmentInfo')}
            />
          ) : null}

          <TextField
            label={t(`event.details.${type}`)}
            placeholder={t(`event.detailsPlaceholder.${type}`)}
            hint={t('event.detailsHint')}
            value={draft.details}
            onChangeText={(details) => update({ details })}
            maxLength={DETAILS_MAX}
            multiline
          />
        </Animated.View>
      ) : (
        <Animated.View entering={enterFromBelow(1, reduced)}>
          <Text tone="muted" align="center">
            {t('event.chooseFirst')}
          </Text>
        </Animated.View>
      )}

      {failed ? <InlineAlert tone="danger" message={t('event.error')} /> : null}

      <Animated.View entering={enterFromBelow(2, reduced)} style={{ marginTop: 'auto' }}>
        <Button label={t('event.save')} size="lg" loading={saving} onPress={() => void save()} />
      </Animated.View>
    </Screen>
  );
}
