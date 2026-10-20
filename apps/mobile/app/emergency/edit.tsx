// « Modifier ma carte d'urgence » (L6-06, CDC F10) : chaque information est FACULTATIVE ; le patient remplit
// seulement ce qu'il veut montrer aux secours. Un champ vide n'est jamais montré.
//  - « Reprendre mon profil » : nom, type de diabète et contact d'urgence du profil, pour les champs encore
//    vides seulement (rien n'est écrasé).
//  - « Utiliser ma dernière mesure » (choix de l'équipe) : la dernière glycémie du téléphone, dans l'unité du
//    patient ; la carte la garde en mg/dL. Jamais d'historique : seule cette valeur est montrée.
//  - Enregistrer ne change pas l'état « activée » de la carte.
import { Ionicons } from '@expo/vector-icons';
import type { DiabetesType, EmergencyCardResponse, GlucoseUnit } from '@glyka/shared';
import { UNIT_LABELS } from '@glyka/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import {
  Button,
  Card,
  ChoiceGroup,
  InlineAlert,
  PressableScale,
  Screen,
  SkeletonCard,
  Text,
  TextField,
} from '@/components/ui';
import {
  BLOOD_GROUPS,
  EMPTY_DRAFT,
  LIMITS,
  cardProblem,
  draftFromCard,
  emergencyApi,
  lastMeasurementSuggestion,
  profileSuggestions,
  toInput,
  validateDraft,
  type BloodGroup,
  type CardDraft,
  type CardProblem,
  type DraftErrors,
} from '@/features/emergency';
import { localMeasurements, readUnit } from '@/features/measurements';
import { profileApi } from '@/features/profile';
import { radii, spacing, useTheme } from '@/theme';
import { formatLocale } from '@/i18n';

const NO_BLOOD_GROUP = 'none';
const DIABETES_LABEL_KEYS: Record<DiabetesType, string> = {
  TYPE_1: 'onboarding.diabetes.type1',
  TYPE_2: 'onboarding.diabetes.type2',
  GESTATIONAL: 'onboarding.diabetes.gestational',
  OTHER: 'onboarding.diabetes.other',
};

export default function EmergencyEditScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const unit: GlucoseUnit = readUnit();
  const [card, setCard] = useState<EmergencyCardResponse | null>(null);
  const [loadProblem, setLoadProblem] = useState<CardProblem | null>(null);
  const [draft, setDraft] = useState<CardDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveProblem, setSaveProblem] = useState<CardProblem | null>(null);
  const [profileNote, setProfileNote] = useState<'applied' | 'nothing' | 'failed' | null>(null);
  const [latest, setLatest] = useState<ReturnType<typeof lastMeasurementSuggestion>>(null);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/emergency'));

  const load = async () => {
    setLoadProblem(null);
    try {
      const current = await emergencyApi.get();
      setCard(current);
      setDraft(draftFromCard(current, unit));
    } catch (error) {
      setLoadProblem(cardProblem(error));
    }
  };

  useEffect(() => {
    void load();
    localMeasurements
      .latest()
      .then((m) => setLatest(lastMeasurementSuggestion(m, unit)))
      .catch(() => setLatest(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule lecture à l'ouverture
  }, []);

  const set = (patch: Partial<CardDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setErrors({});
    setSaveProblem(null);
  };

  const applyProfile = async () => {
    setProfileNote(null);
    try {
      const profile = await profileApi.get();
      const patch = profileSuggestions(draft, profile, (type) => t(DIABETES_LABEL_KEYS[type]));
      if (Object.keys(patch).length === 0) setProfileNote('nothing');
      else {
        set(patch);
        setProfileNote('applied');
      }
    } catch {
      setProfileNote('failed');
    }
  };

  const save = async () => {
    if (!card) return;
    const found = validateDraft(draft, unit);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    setSaveProblem(null);
    try {
      await emergencyApi.save(toInput(draft, unit, card.enabled));
      close();
    } catch (error) {
      setSaveProblem(cardProblem(error));
    } finally {
      setSaving(false);
    }
  };

  const errorText = (field: keyof CardDraft) =>
    errors[field]
      ? t(`emergency.edit.error.${errors[field]}`, {
          max: field in LIMITS ? LIMITS[field as keyof typeof LIMITS] : undefined,
        })
      : undefined;

  const measuredDate = latest
    ? new Date(latest.measuredAt).toLocaleDateString(formatLocale(i18n.language), {
        day: 'numeric',
        month: 'short',
      })
    : '';

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="overline" tone="primary">
            {t('emergency.title')}
          </Text>
          <Text variant="title" accessibilityRole="header">
            {t('emergency.edit.title')}
          </Text>
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('emergency.edit.cancel')}
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
      <Text tone="muted">{t('emergency.edit.intro')}</Text>

      {!card && !loadProblem ? <SkeletonCard /> : null}
      {loadProblem ? (
        <InlineAlert
          tone="warning"
          title={t(`emergency.problem.${loadProblem}.title`)}
          message={t(`emergency.problem.${loadProblem}.text`)}
          actionLabel={t('common.retry')}
          onAction={() => void load()}
        />
      ) : null}

      {card ? (
        <>
          <Card variant="tinted" index={0} style={{ gap: spacing.sm }}>
            <Text variant="bodyStrong">{t('emergency.edit.profile.title')}</Text>
            <Text variant="bodySmall" tone="muted">
              {t('emergency.edit.profile.text')}
            </Text>
            <Button
              label={t('emergency.edit.profile.action')}
              variant="outline"
              icon={<Ionicons name="person-outline" size={18} color={colors.primaryText} />}
              onPress={() => void applyProfile()}
            />
            {profileNote ? (
              <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
                {t(`emergency.edit.profile.${profileNote}`)}
              </Text>
            ) : null}
          </Card>

          <TextField
            label={t('emergency.field.fullName')}
            value={draft.fullName}
            onChangeText={(fullName) => set({ fullName })}
            maxLength={LIMITS.fullName + 20}
            autoComplete="name"
            error={errorText('fullName')}
          />
          <TextField
            label={t('emergency.field.diabetesType')}
            hint={t('emergency.edit.hint.diabetesType')}
            value={draft.diabetesType}
            onChangeText={(diabetesType) => set({ diabetesType })}
            maxLength={LIMITS.diabetesType + 20}
            error={errorText('diabetesType')}
          />
          <TextField
            label={t('emergency.field.declaredTreatment')}
            hint={t('emergency.edit.hint.declaredTreatment')}
            value={draft.declaredTreatment}
            onChangeText={(declaredTreatment) => set({ declaredTreatment })}
            maxLength={LIMITS.declaredTreatment + 20}
            multiline
            error={errorText('declaredTreatment')}
          />
          <TextField
            label={t('emergency.field.allergies')}
            hint={t('emergency.edit.hint.allergies')}
            value={draft.allergies}
            onChangeText={(allergies) => set({ allergies })}
            maxLength={LIMITS.allergies + 20}
            multiline
            error={errorText('allergies')}
          />

          <ChoiceGroup
            label={t('emergency.field.bloodGroup')}
            columns={3}
            options={[
              ...BLOOD_GROUPS.map((group) => ({ value: group, label: group })),
              { value: NO_BLOOD_GROUP, label: t('emergency.edit.noBloodGroup') },
            ]}
            value={draft.bloodGroup ?? NO_BLOOD_GROUP}
            onChange={(value) =>
              set({ bloodGroup: value === NO_BLOOD_GROUP ? null : (value as BloodGroup) })
            }
          />

          <View style={{ gap: spacing.sm }}>
            <TextField
              label={`${t('emergency.field.lastKnownGlucoseMgDl')} (${UNIT_LABELS[unit]})`}
              hint={t('emergency.edit.hint.glucose')}
              value={draft.glucose}
              onChangeText={(glucose) => set({ glucose })}
              keyboardType="decimal-pad"
              error={errorText('glucose')}
            />
            {latest ? (
              <Button
                label={t('emergency.edit.useLatest', { value: latest.label, date: measuredDate })}
                variant="ghost"
                icon={<Ionicons name="pulse-outline" size={18} color={colors.primaryText} />}
                onPress={() => set({ glucose: latest.glucose })}
              />
            ) : null}
          </View>

          <TextField
            label={t('emergency.field.emergencyContactName')}
            value={draft.emergencyContactName}
            onChangeText={(emergencyContactName) => set({ emergencyContactName })}
            maxLength={LIMITS.emergencyContactName + 20}
            error={errorText('emergencyContactName')}
          />
          <TextField
            label={t('emergency.field.emergencyContactPhone')}
            hint={t('emergency.edit.hint.phone')}
            value={draft.emergencyContactPhone}
            onChangeText={(emergencyContactPhone) => set({ emergencyContactPhone })}
            keyboardType="phone-pad"
            autoComplete="tel"
            maxLength={LIMITS.emergencyContactPhone + 10}
            error={errorText('emergencyContactPhone')}
          />

          <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }}>
            <Ionicons
              name="lock-closed-outline"
              size={14}
              color={colors.textMuted}
              style={{ marginTop: 2 }}
            />
            <Text variant="caption" tone="muted" style={{ flex: 1 }}>
              {t('emergency.edit.privacy')}
            </Text>
          </View>

          {Object.keys(errors).length > 0 ? (
            <InlineAlert tone="warning" message={t('emergency.edit.fixErrors')} />
          ) : null}
          {saveProblem ? (
            <InlineAlert
              tone={saveProblem === 'error' ? 'danger' : 'warning'}
              title={t(`emergency.problem.${saveProblem}.title`)}
              message={t(`emergency.problem.${saveProblem}.text`)}
            />
          ) : null}

          <Button
            label={t('emergency.edit.save')}
            size="lg"
            loading={saving}
            icon={<Ionicons name="checkmark" size={20} color={colors.onPrimary} />}
            onPress={() => void save()}
          />
        </>
      ) : null}
    </Screen>
  );
}
