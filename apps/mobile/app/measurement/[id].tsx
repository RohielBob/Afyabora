// Détail d'une mesure (L2-11, CDC F2 « modification et suppression possibles ») : ouvert en touchant une
// mesure dans l'Historique ou la carte « Dernière mesure ».
//  - en haut : la mesure telle qu'elle est gardée (valeur, état, provenance, contexte, date) ;
//  - formulaire : valeur (pas de clavier imposé à l'ouverture), unité (la valeur est convertie), date et
//    heure (à partir de la date d'origine, jamais dans le futur), contexte, note ;
//  - valeur inhabituelle : même question « est-ce correct ? » qu'à la saisie (L2-04) ;
//  - seuls les champs changés sont écrits (L8-03 : la mesure complète part à la synchronisation) ;
//  - suppression : confirmation dans la page, puis pierre tombale + note effacée (L8-03).
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, View, type TextInput } from 'react-native';
import Animated from 'react-native-reanimated';
import {
  DEFAULT_THRESHOLDS,
  GLUCOSE_UNITS,
  MEASUREMENT_CONTEXTS,
  UNIT_LABELS,
  classifyGlucose,
  type GlucoseThresholds,
  type GlucoseUnit,
  type MeasurementContext,
} from '@glyka/shared';
import {
  Button,
  Card,
  ChoiceGroup,
  InlineAlert,
  PressableScale,
  RangeBadge,
  Screen,
  SegmentedControl,
  Skeleton,
  Text,
  TextField,
} from '@/components/ui';
import {
  DateTimeAdjuster,
  UnusualValueCard,
  ValueField,
  convertText,
  draftFromMeasurement,
  formatClock,
  formatReading,
  likelyUnits,
  localMeasurements,
  parseValue,
  toUpdatePatch,
  validateEdit,
  type EditDraft,
  type LocalMeasurement,
} from '@/features/measurements';
import { readThresholds } from '@/features/profile';
import { ProvenanceBadge } from '@/features/timeline';
import { enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';

type Load =
  { status: 'loading' } | { status: 'missing' } | { status: 'ready'; row: LocalMeasurement };

export default function MeasurementDetailScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const { id } = useLocalSearchParams<{ id: string }>();
  const valueRef = useRef<TextInput>(null);

  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [thresholds, setThresholds] = useState<GlucoseThresholds>(DEFAULT_THRESHOLDS);
  const [submitted, setSubmitted] = useState(false);
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<'save' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([localMeasurements.get(String(id)), readThresholds()])
      .then(([row, own]) => {
        if (!alive) return;
        setThresholds(own);
        if (!row) return setLoad({ status: 'missing' });
        setLoad({ status: 'ready', row });
        setDraft(draftFromMeasurement(row));
      })
      .catch(() => alive && setLoad({ status: 'missing' }));
    return () => {
      alive = false;
    };
  }, [id]);

  const parsed = useMemo(() => (draft ? parseValue(draft.text, draft.unit) : null), [draft]);
  const now = new Date();
  const errors = draft && submitted ? validateEdit(draft, now) : {};

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/timeline'));

  const update = (patch: Partial<EditDraft>) => {
    // Nouvelle valeur ou nouvelle unité : la confirmation portait sur l'ancienne, elle ne vaut plus.
    const valueChanged = 'text' in patch || 'unit' in patch;
    setDraft((d) =>
      d ? { ...d, ...patch, ...(valueChanged ? { confirmedUnusual: false } : {}) } : d,
    );
    if (valueChanged) setAsking(false);
    setFailed(null);
  };

  const save = async (confirmUnusual = false) => {
    if (load.status !== 'ready' || !draft) return;
    setSubmitted(true);
    const entry = confirmUnusual ? { ...draft, confirmedUnusual: true } : draft;
    if (confirmUnusual) setDraft(entry);
    const problems = validateEdit(entry, new Date());
    if (Object.keys(problems).length) {
      if (problems.value === 'measurement.problem.unusual') {
        Keyboard.dismiss();
        setAsking(true);
      } else {
        setAsking(false);
        if (problems.value) valueRef.current?.focus();
      }
      return;
    }
    setAsking(false);
    const patch = toUpdatePatch(load.row, entry);
    if (!patch) return close(); // rien n'a changé : rien à écrire
    setSaving(true);
    try {
      await localMeasurements.update(load.row.id, patch);
      close();
    } catch {
      setFailed('save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (load.status !== 'ready') return;
    setSaving(true);
    try {
      await localMeasurements.remove(load.row.id);
      close();
    } catch {
      setFailed('delete');
      setSaving(false);
    }
  };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text variant="overline" tone="primary">
          {t('measurement.edit.overline')}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {t('measurement.edit.title')}
        </Text>
      </View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t('measurement.edit.close')}
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
  );

  if (load.status === 'loading' || (load.status === 'ready' && !draft)) {
    return (
      <Screen>
        {header}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ gap: spacing.md }}
        >
          <Skeleton height={120} radius={radii.lg} />
          <Skeleton height={90} radius={radii.xl} />
          <Skeleton height={48} radius={radii.md} />
        </View>
      </Screen>
    );
  }

  if (load.status === 'missing' || !draft) {
    return (
      <Screen>
        {header}
        <Card variant="outlined" style={{ alignItems: 'center', gap: spacing.md }}>
          <Ionicons name="search-outline" size={28} color={colors.textMuted} />
          <Text variant="heading" align="center">
            {t('measurement.edit.missingTitle')}
          </Text>
          <Text tone="muted" align="center">
            {t('measurement.edit.missingText')}
          </Text>
          <Button label={t('measurement.edit.back')} variant="outline" onPress={close} />
        </Card>
      </Screen>
    );
  }

  const row = load.row;
  const saved = new Date(row.measured_at);
  const savedDay = saved.toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <Screen>
      {header}

      {/* La mesure telle qu'elle est gardée sur le téléphone. */}
      <Card variant="outlined" index={0} style={{ gap: spacing.sm }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md }}
        >
          <Text variant="display" style={{ fontVariant: ['tabular-nums'] }}>
            {formatReading(row.value_mgdl, row.original_unit)}
          </Text>
          <RangeBadge state={classifyGlucose(row.value_mgdl, thresholds)} />
        </View>
        <Text tone="muted">
          {t(`measurement.context.${row.context}`)} ·{' '}
          {t('measurement.edit.savedAt', {
            day: savedDay,
            time: formatClock(saved.getHours(), saved.getMinutes()),
          })}
        </Text>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}
        >
          <ProvenanceBadge source={row.source} importBatchId={row.import_batch_id} />
          {row.pending_sync === 1 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="cloud-upload-outline" size={12} color={colors.textMuted} />
              <Text variant="caption" tone="muted" style={{ fontSize: 11 }}>
                {t('timeline.pending')}
              </Text>
            </View>
          ) : null}
        </View>
      </Card>

      <Animated.View entering={enterFromBelow(1, reduced)}>
        <ValueField
          ref={valueRef}
          autoFocus={false}
          text={draft.text}
          onChangeText={(text) => update({ text })}
          unit={draft.unit}
          mgDl={parsed?.mgDl ?? null}
          error={!asking && errors.value ? t(errors.value) : undefined}
          attention={asking}
        />
      </Animated.View>

      {asking && parsed?.problem === 'unusual' ? (
        <UnusualValueCard
          text={draft.text}
          unit={draft.unit}
          likely={likelyUnits(draft.text, draft.unit)}
          saving={saving}
          onSwitchUnit={(unit) => update({ unit })}
          onFix={() => {
            setAsking(false);
            valueRef.current?.focus();
          }}
          onConfirm={() => void save(true)}
        />
      ) : null}

      <Animated.View entering={enterFromBelow(2, reduced)} style={{ gap: spacing.sm }}>
        <Text variant="label" tone="muted">
          {t('measurement.unitLabel')}
        </Text>
        <SegmentedControl<GlucoseUnit>
          accessibilityLabel={t('measurement.unitLabel')}
          value={draft.unit}
          onChange={(unit) => update({ unit, text: convertText(draft.text, draft.unit, unit) })}
          options={GLUCOSE_UNITS.map((u) => ({ value: u, label: UNIT_LABELS[u] }))}
        />
      </Animated.View>

      <Animated.View entering={enterFromBelow(3, reduced)}>
        <DateTimeAdjuster
          at={draft.at}
          now={now}
          onChange={(at) => update({ at })}
          error={errors.when && t(errors.when)}
        />
      </Animated.View>

      <Animated.View entering={enterFromBelow(4, reduced)}>
        <ChoiceGroup<MeasurementContext>
          label={t('measurement.context.label')}
          value={draft.context}
          columns={2}
          onChange={(context) => update({ context })}
          options={MEASUREMENT_CONTEXTS.map((value) => ({
            value,
            label: t(`measurement.context.${value}`),
          }))}
        />
      </Animated.View>

      <Animated.View entering={enterFromBelow(5, reduced)}>
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

      {failed ? (
        <InlineAlert
          tone="danger"
          message={t(
            failed === 'save' ? 'measurement.edit.saveError' : 'measurement.edit.deleteError',
          )}
        />
      ) : null}

      <Animated.View entering={enterFromBelow(6, reduced)} style={{ gap: spacing.md }}>
        <Button
          label={t('measurement.edit.save')}
          size="lg"
          loading={saving && !confirmDelete}
          onPress={() => void save()}
        />

        {confirmDelete ? (
          <Animated.View entering={enterFromBelow(0, reduced)} style={{ gap: spacing.sm }}>
            <InlineAlert
              tone="warning"
              title={t('measurement.edit.deleteTitle')}
              message={t('measurement.edit.deleteText')}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  label={t('measurement.edit.cancel')}
                  variant="outline"
                  onPress={() => setConfirmDelete(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={t('measurement.edit.deleteConfirm')}
                  variant="danger"
                  loading={saving}
                  icon={<Ionicons name="trash-outline" size={18} color={colors.danger} />}
                  onPress={() => void remove()}
                />
              </View>
            </View>
          </Animated.View>
        ) : (
          <Button
            label={t('measurement.edit.delete')}
            variant="ghost"
            icon={<Ionicons name="trash-outline" size={18} color={colors.primaryText} />}
            onPress={() => setConfirmDelete(true)}
          />
        )}
      </Animated.View>
    </Screen>
  );
}
