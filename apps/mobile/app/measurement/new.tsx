// Saisie rapide d'une mesure (L2-03, CDC F2 : « en moins de 10 secondes »).
// Ordre de l'écran = ordre de la saisie : valeur (clavier numérique ouvert tout de suite) → unité → quand
// (maintenant par défaut) → contexte → note facultative → Enregistrer.
// Écriture LOCALE d'abord (ADR-0004) : la mesure et son opération de synchronisation sont gardées sur le
// téléphone ; l'envoi au serveur viendra avec le moteur de synchronisation (L8-06).
// Valeur hors des bornes plausibles : à vérifier (la confirmation « c'est correct » arrive avec L2-04).
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type TextInput } from 'react-native';
import Animated from 'react-native-reanimated';
import {
  GLUCOSE_UNITS,
  MEASUREMENT_CONTEXTS,
  UNIT_LABELS,
  formatGlucose,
  type GlucoseUnit,
  type MeasurementContext,
} from '@glyka/shared';
import {
  Button,
  ChoiceGroup,
  InlineAlert,
  PressableScale,
  Screen,
  SegmentedControl,
  Text,
  TextField,
} from '@/components/ui';
import {
  SavedState,
  ValueField,
  WhenPicker,
  convertText,
  formatClock,
  initialWhen,
  isExactDuplicate,
  localMeasurements,
  parseValue,
  readUnit,
  resolveWhen,
  toCreateInput,
  validateEntry,
  writeUnit,
  type EntryDraft,
} from '@/features/measurements';
import { enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';

function newDraft(): EntryDraft {
  return { text: '', unit: readUnit(), when: initialWhen(new Date()), context: null, note: '' };
}

export default function NewMeasurementScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const valueRef = useRef<TextInput>(null);

  const [draft, setDraft] = useState<EntryDraft>(newDraft);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState<{ value: string; detail: string } | null>(null);

  const update = (patch: Partial<EntryDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDuplicate(false); // la saisie a changé : l'avertissement de doublon ne vaut plus
    setFailed(false);
  };

  const parsed = useMemo(() => parseValue(draft.text, draft.unit), [draft.text, draft.unit]);
  // Les erreurs n'apparaissent qu'après un premier essai, puis se mettent à jour en direct.
  const errors = submitted ? validateEntry(draft, new Date()) : {};

  /** « Aujourd'hui, 08:30 » pour l'écran de réussite. */
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

  const save = async (allowDuplicate = false) => {
    setSubmitted(true);
    const now = new Date();
    if (Object.keys(validateEntry(draft, now)).length) {
      if (parseValue(draft.text, draft.unit).problem) valueRef.current?.focus();
      return;
    }
    const input = toCreateInput(draft, now);
    setSaving(true);
    try {
      // Doublon exact (même minute, même valeur) : on prévient, la personne décide (CDC F2).
      if (!allowDuplicate) {
        const sameMinute = await localMeasurements.sameMinute(input.measuredAt);
        if (
          isExactDuplicate({ mgDl: parsed.mgDl ?? 0, measuredAt: input.measuredAt }, sameMinute)
        ) {
          setDuplicate(true);
          return;
        }
      }
      await localMeasurements.save(input);
      writeUnit(draft.unit); // la prochaine saisie s'ouvre dans la même unité
      setSaved({
        value: formatGlucose(parsed.mgDl ?? 0, draft.unit),
        detail: `${t(`measurement.context.${input.context}`)} · ${describeWhen(resolveWhen(draft.when, now))}`,
      });
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  if (saved) {
    return (
      <Screen>
        <SavedState
          value={saved.value}
          detail={saved.detail}
          onDone={close}
          onAnother={() => {
            setSaved(null);
            setSubmitted(false);
            setDraft((d) => ({ ...newDraft(), unit: d.unit }));
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {/* En-tête : titre + fermer (sans enregistrer). */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="overline" tone="primary">
            {t('measurement.overline')}
          </Text>
          <Text variant="title" accessibilityRole="header">
            {t('measurement.title')}
          </Text>
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('measurement.close')}
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
        <ValueField
          ref={valueRef}
          text={draft.text}
          onChangeText={(text) => update({ text })}
          unit={draft.unit}
          mgDl={parsed.mgDl}
          error={errors.value && t(errors.value)}
        />
      </Animated.View>

      <Animated.View entering={enterFromBelow(1, reduced)} style={{ gap: spacing.sm }}>
        <Text variant="label" tone="muted">
          {t('measurement.unitLabel')}
        </Text>
        <SegmentedControl<GlucoseUnit>
          accessibilityLabel={t('measurement.unitLabel')}
          value={draft.unit}
          // La valeur déjà tapée est convertie : 1,48 g/L devient 148 mg/dL (CDC F2).
          onChange={(unit) => update({ unit, text: convertText(draft.text, draft.unit, unit) })}
          options={GLUCOSE_UNITS.map((u) => ({ value: u, label: UNIT_LABELS[u] }))}
        />
      </Animated.View>

      <Animated.View entering={enterFromBelow(2, reduced)}>
        <WhenPicker
          when={draft.when}
          onChange={(when) => update({ when })}
          error={errors.when && t(errors.when)}
        />
      </Animated.View>

      <Animated.View entering={enterFromBelow(3, reduced)}>
        <ChoiceGroup<MeasurementContext>
          label={t('measurement.context.label')}
          value={draft.context}
          // 2 par ligne : libellés jamais coupés (« Après repas ») et pastilles faciles à toucher.
          columns={2}
          onChange={(context) => update({ context })}
          error={errors.context && t(errors.context)}
          options={MEASUREMENT_CONTEXTS.map((value) => ({
            value,
            label: t(`measurement.context.${value}`),
          }))}
        />
      </Animated.View>

      <Animated.View entering={enterFromBelow(4, reduced)}>
        <TextField
          label={t('measurement.noteLabel')}
          placeholder={t('measurement.notePlaceholder')}
          hint={t('measurement.noteHint')}
          value={draft.note}
          onChangeText={(note) => update({ note })}
          maxLength={500}
          multiline
        />
      </Animated.View>

      {duplicate ? (
        <InlineAlert
          tone="warning"
          title={t('measurement.duplicateTitle')}
          message={t('measurement.duplicate')}
          actionLabel={t('measurement.duplicateConfirm')}
          onAction={() => void save(true)}
        />
      ) : null}
      {failed ? <InlineAlert tone="danger" message={t('measurement.error')} /> : null}

      <Animated.View entering={enterFromBelow(5, reduced)} style={{ marginTop: 'auto' }}>
        <Button
          label={t('measurement.save')}
          size="lg"
          loading={saving}
          onPress={() => void save()}
        />
      </Animated.View>
    </Screen>
  );
}
