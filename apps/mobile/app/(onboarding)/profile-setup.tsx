// Assistant de profil (L1-08) : 4 étapes + résumé, puis enregistrement (PUT /me/profile, L1-05).
//   1. Qui êtes-vous ?   prénom, nom, date de naissance, sexe            (obligatoire)
//   2. Votre diabète     type (obligatoire), année du diagnostic (facultative)
//   3. Unité et seuils   unité préférée, plage cible et seuils (valeurs par défaut « à définir avec votre médecin »)
//   4. Vos contacts      un proche et/ou le médecin traitant (facultatifs, mais complets s'ils sont commencés)
//   5. Résumé            vérifier, modifier une étape, enregistrer
// On ne passe à l'étape suivante que si l'étape est valide (mêmes règles que le serveur).
// Chaque étape apparaît en glissant ; la barre de progression se remplit.
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type TextInput } from 'react-native';
import Animated, { FadeIn, SlideInLeft, SlideInRight } from 'react-native-reanimated';
import type { GlucoseUnit } from '@glyka/shared';
import {
  Button,
  Card,
  Checkbox,
  ChoiceGroup,
  InlineAlert,
  Screen,
  Text,
  TextField,
} from '@/components/ui';
import {
  SuccessState,
  authErrorMessage,
  markProfileCompleted,
  type ErrorMessage,
} from '@/features/auth';
import { MedicalDisclaimer } from '@/features/legal';
import { writeUnit } from '@/features/measurements';
import {
  STEPS,
  THRESHOLD_KEYS,
  StepProgress,
  ThresholdBar,
  convertThresholds,
  displayToMgDl,
  finalPayload,
  firstInvalidStep,
  initialDraft,
  maskBirthDate,
  profileApi,
  saveThresholds,
  validateStep,
  type ProfileDraft,
  type Step,
  type StepErrors,
} from '@/features/profile';
import { durations, easing, spacing, useReducedMotion } from '@/theme';

const UNIT_LABEL: Record<GlucoseUnit, string> = { G_L: 'g/L', MG_DL: 'mg/dL', MMOL_L: 'mmol/L' };
const FORM_STEPS = STEPS.length - 1; // le résumé n'est pas compté comme une étape à remplir

export default function ProfileSetupScreen() {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const [draft, setDraft] = useState<ProfileDraft>(initialDraft);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<'next' | 'back'>('next');
  const [errors, setErrors] = useState<StepErrors>({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<ErrorMessage | null>(null);
  const [done, setDone] = useState(false);
  const lastNameRef = useRef<TextInput>(null);
  const birthRef = useRef<TextInput>(null);

  const step: Step = STEPS[index]!;
  const update = (patch: Partial<ProfileDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    // Une fois les erreurs affichées, elles se mettent à jour pendant la saisie.
    if (Object.keys(errors).length) setErrors(validateStep(step, next));
  };
  const err = (path: string) => (errors[path] ? t(errors[path]!) : undefined);

  const goTo = (target: number) => {
    setDirection(target > index ? 'next' : 'back');
    setErrors({});
    setApiError(null);
    setIndex(target);
  };

  const next = () => {
    const stepErrors = validateStep(step, draft);
    if (Object.keys(stepErrors).length) {
      setErrors(stepErrors);
      return;
    }
    goTo(index + 1);
  };

  const save = async () => {
    const payload = finalPayload(draft);
    if (!payload) {
      const invalid = firstInvalidStep(draft);
      if (invalid) {
        goTo(STEPS.indexOf(invalid));
        setErrors(validateStep(invalid, draft));
      }
      return;
    }
    setSaving(true);
    setApiError(null);
    try {
      await profileApi.save(payload);
      writeUnit(draft.unit); // la saisie des mesures (L2-03) s'ouvrira dans l'unité choisie
      // Seuils gardés sur le téléphone : message de sécurité hors-ligne à la saisie (L2-04).
      await saveThresholds(payload.thresholds);
      setDone(true);
    } catch (e) {
      setApiError(authErrorMessage(e, 'register'));
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    await markProfileCompleted(); // l'accueil devient accessible (session, L1-07)
    router.replace('/(tabs)');
  };

  const thresholdsMgDl = useMemo(
    () =>
      Object.fromEntries(
        THRESHOLD_KEYS.map((key) => [key, displayToMgDl(draft.thresholds[key], draft.unit)]),
      ) as Record<(typeof THRESHOLD_KEYS)[number], number | null>,
    [draft.thresholds, draft.unit],
  );

  if (done) {
    return (
      <Screen>
        <SuccessState
          title={t('onboarding.done.title', { name: draft.firstName.trim() })}
          message={t('onboarding.done.message')}
          actionLabel={t('onboarding.done.action')}
          onAction={finish}
        />
      </Screen>
    );
  }

  // Animation d'entrée de l'étape : glisse depuis la droite (suivant) ou la gauche (retour).
  const entering = reduced
    ? FadeIn.duration(durations.fast)
    : (direction === 'next' ? SlideInRight : SlideInLeft)
        .duration(durations.slow)
        .easing(easing.decelerate);

  return (
    <Screen scrollKey={step}>
      {step === 'summary' ? (
        <View style={{ gap: spacing.sm }}>
          <Text variant="overline" tone="primary">
            {t('onboarding.summary.overline')}
          </Text>
          <Text variant="title" accessibilityRole="header">
            {t('onboarding.summary.title')}
          </Text>
        </View>
      ) : (
        <StepProgress
          current={index + 1}
          total={FORM_STEPS}
          title={t(`onboarding.${step}.title`)}
        />
      )}

      {apiError ? <InlineAlert tone="danger" message={t(apiError.key, apiError.params)} /> : null}

      <Animated.View key={step} entering={entering} style={{ gap: spacing.lg }}>
        {step === 'identity' ? (
          <>
            <Text tone="muted">{t('onboarding.identity.intro')}</Text>
            <TextField
              label={t('onboarding.identity.firstName')}
              value={draft.firstName}
              onChangeText={(firstName) => update({ firstName })}
              error={err('firstName')}
              autoComplete="given-name"
              textContentType="givenName"
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => lastNameRef.current?.focus()}
            />
            <TextField
              ref={lastNameRef}
              label={t('onboarding.identity.lastName')}
              value={draft.lastName}
              onChangeText={(lastName) => update({ lastName })}
              error={err('lastName')}
              autoComplete="family-name"
              textContentType="familyName"
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => birthRef.current?.focus()}
            />
            <TextField
              ref={birthRef}
              label={t('onboarding.identity.birthDate')}
              placeholder={t('onboarding.identity.birthDatePlaceholder')}
              value={draft.birthDate}
              onChangeText={(text) => update({ birthDate: maskBirthDate(text) })}
              error={err('birthDate')}
              keyboardType="number-pad"
              maxLength={10}
            />
            <ChoiceGroup
              label={t('onboarding.identity.sex')}
              value={draft.sex}
              onChange={(sex) => update({ sex })}
              error={err('sex')}
              columns={3}
              options={[
                { value: 'F', label: t('onboarding.identity.sexF') },
                { value: 'M', label: t('onboarding.identity.sexM') },
                { value: 'OTHER', label: t('onboarding.identity.sexOther') },
              ]}
            />
          </>
        ) : null}

        {step === 'diabetes' ? (
          <>
            <Text tone="muted">{t('onboarding.diabetes.intro')}</Text>
            <ChoiceGroup
              label={t('onboarding.diabetes.type')}
              value={draft.diabetesType}
              onChange={(diabetesType) => update({ diabetesType })}
              error={err('diabetesType')}
              options={[
                { value: 'TYPE_1', label: t('onboarding.diabetes.type1') },
                { value: 'TYPE_2', label: t('onboarding.diabetes.type2') },
                { value: 'GESTATIONAL', label: t('onboarding.diabetes.gestational') },
                { value: 'OTHER', label: t('onboarding.diabetes.other') },
              ]}
            />
            <TextField
              label={t('onboarding.diabetes.year')}
              hint={t('onboarding.diabetes.yearHint')}
              placeholder="2016"
              value={draft.diagnosisYear}
              onChangeText={(text) =>
                update({ diagnosisYear: text.replace(/\D/g, '').slice(0, 4) })
              }
              error={err('diagnosisYear')}
              keyboardType="number-pad"
              maxLength={4}
            />
          </>
        ) : null}

        {step === 'thresholds' ? (
          <>
            <Text tone="muted">{t('onboarding.thresholds.intro')}</Text>
            <ChoiceGroup
              label={t('onboarding.thresholds.unit')}
              value={draft.unit}
              columns={3}
              onChange={(unit) =>
                update({ unit, thresholds: convertThresholds(draft.thresholds, draft.unit, unit) })
              }
              options={(['G_L', 'MG_DL', 'MMOL_L'] as const).map((value) => ({
                value,
                label: UNIT_LABEL[value],
              }))}
            />
            <InlineAlert tone="info" message={t('onboarding.thresholds.doctorNote')} />
            <ThresholdBar mgDl={thresholdsMgDl} />
            {/* Deux groupes alignés : plage cible (de / à), puis seuils d'alerte (très bas / très haut). */}
            {(
              [
                ['rangeTitle', ['targetMinMgDl', 'targetMaxMgDl'], 'rangeHint'],
                ['alertTitle', ['veryLowMgDl', 'veryHighMgDl'], 'alertHint'],
              ] as const
            ).map(([title, keys, hint]) => (
              <View key={title} style={{ gap: spacing.sm }}>
                <Text variant="subheading">
                  {t(`onboarding.thresholds.${title}`)} ({UNIT_LABEL[draft.unit]})
                </Text>
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  {keys.map((key) => (
                    <View key={key} style={{ flex: 1 }}>
                      <TextField
                        label={t(`onboarding.thresholds.short.${key}`)}
                        value={draft.thresholds[key]}
                        onChangeText={(text) =>
                          update({ thresholds: { ...draft.thresholds, [key]: text } })
                        }
                        error={err(`thresholds.${key}`)}
                        keyboardType="decimal-pad"
                        maxLength={6}
                      />
                    </View>
                  ))}
                </View>
                <Text variant="caption" tone="muted">
                  {t(`onboarding.thresholds.${hint}`)}
                </Text>
              </View>
            ))}
            <Button
              label={t('onboarding.thresholds.reset')}
              variant="ghost"
              onPress={() => update({ thresholds: initialDraftThresholds(draft.unit) })}
            />
            <Checkbox
              checked={draft.thresholdsReviewedByClinician}
              onChange={(thresholdsReviewedByClinician) =>
                update({ thresholdsReviewedByClinician })
              }
              label={t('onboarding.thresholds.reviewed')}
              accessibilityLabel={t('onboarding.thresholds.reviewed')}
            />
          </>
        ) : null}

        {step === 'contacts' ? (
          <>
            <Text tone="muted">{t('onboarding.contacts.intro')}</Text>
            <Card variant="outlined" animateIn={false}>
              <Text variant="subheading">{t('onboarding.contacts.relativeTitle')}</Text>
              <Text variant="bodySmall" tone="muted">
                {t('onboarding.contacts.relativeHint')}
              </Text>
              <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
                <TextField
                  label={t('onboarding.contacts.name')}
                  value={draft.relativeName}
                  onChangeText={(relativeName) => update({ relativeName })}
                  error={err('emergencyContact.name')}
                  autoCapitalize="words"
                />
                <TextField
                  label={t('onboarding.contacts.phone')}
                  placeholder="+243 81 000 0000"
                  value={draft.relativePhone}
                  onChangeText={(relativePhone) => update({ relativePhone })}
                  error={err('emergencyContact.phone')}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                />
                <TextField
                  label={t('onboarding.contacts.relation')}
                  placeholder={t('onboarding.contacts.relationPlaceholder')}
                  value={draft.relativeRelation}
                  onChangeText={(relativeRelation) => update({ relativeRelation })}
                  error={err('emergencyContact.relation')}
                />
              </View>
            </Card>
            <Card variant="outlined" animateIn={false}>
              <Text variant="subheading">{t('onboarding.contacts.doctorTitle')}</Text>
              <Text variant="bodySmall" tone="muted">
                {t('onboarding.contacts.doctorHint')}
              </Text>
              <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
                <TextField
                  label={t('onboarding.contacts.doctorName')}
                  placeholder={t('onboarding.contacts.doctorNamePlaceholder')}
                  value={draft.doctorName}
                  onChangeText={(doctorName) => update({ doctorName })}
                  error={err('doctorContact.name')}
                  autoCapitalize="words"
                />
                <TextField
                  label={t('onboarding.contacts.phone')}
                  placeholder="+243 82 000 0000"
                  value={draft.doctorPhone}
                  onChangeText={(doctorPhone) => update({ doctorPhone })}
                  error={err('doctorContact.phone')}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                />
              </View>
            </Card>
          </>
        ) : null}

        {step === 'summary' ? (
          <>
            <Summary draft={draft} onEdit={(s) => goTo(STEPS.indexOf(s))} />
            {/* Rappel avant d'enregistrer : les seuils servent au suivi, pas à décider d'un traitement. */}
            <MedicalDisclaimer index={4} />
          </>
        ) : null}
      </Animated.View>

      {/* Navigation */}
      <View style={{ gap: spacing.sm, marginTop: 'auto' }}>
        {step === 'summary' ? (
          <Button label={t('onboarding.summary.save')} size="lg" loading={saving} onPress={save} />
        ) : (
          <Button
            label={index === FORM_STEPS - 1 ? t('onboarding.review') : t('onboarding.next')}
            size="lg"
            onPress={next}
          />
        )}
        {index > 0 ? (
          <Button
            label={t('common.back')}
            variant="ghost"
            disabled={saving}
            onPress={() => goTo(index - 1)}
          />
        ) : null}
        <Text variant="caption" tone="muted" align="center">
          {t('onboarding.privacy')}
        </Text>
      </View>
    </Screen>
  );
}

function initialDraftThresholds(unit: GlucoseUnit) {
  return convertThresholds(initialDraft().thresholds, 'G_L', unit);
}

/** Résumé : une carte par étape, chacune avec « Modifier ». */
function Summary({ draft, onEdit }: { draft: ProfileDraft; onEdit: (step: Step) => void }) {
  const { t } = useTranslation();
  const dash = '—';
  const sexLabel = { F: 'sexF', M: 'sexM', OTHER: 'sexOther' } as const;
  const typeLabel = {
    TYPE_1: 'type1',
    TYPE_2: 'type2',
    GESTATIONAL: 'gestational',
    OTHER: 'other',
  } as const;
  const unit = UNIT_LABEL[draft.unit];

  const sections: { step: Step; title: string; lines: [string, string][] }[] = [
    {
      step: 'identity',
      title: t('onboarding.identity.title'),
      lines: [
        [t('onboarding.summary.name'), `${draft.firstName.trim()} ${draft.lastName.trim()}`],
        [t('onboarding.identity.birthDate'), draft.birthDate],
        [
          t('onboarding.identity.sex'),
          draft.sex ? t(`onboarding.identity.${sexLabel[draft.sex]}`) : dash,
        ],
      ],
    },
    {
      step: 'diabetes',
      title: t('onboarding.diabetes.title'),
      lines: [
        [
          t('onboarding.diabetes.type'),
          draft.diabetesType ? t(`onboarding.diabetes.${typeLabel[draft.diabetesType]}`) : dash,
        ],
        [t('onboarding.diabetes.year'), draft.diagnosisYear || dash],
      ],
    },
    {
      step: 'thresholds',
      title: t('onboarding.thresholds.title'),
      lines: [
        [t('onboarding.thresholds.unit'), unit],
        [
          t('onboarding.summary.target'),
          `${draft.thresholds.targetMinMgDl} – ${draft.thresholds.targetMaxMgDl} ${unit}`,
        ],
        [t('onboarding.thresholds.veryLowMgDl'), `< ${draft.thresholds.veryLowMgDl} ${unit}`],
        [t('onboarding.thresholds.veryHighMgDl'), `> ${draft.thresholds.veryHighMgDl} ${unit}`],
      ],
    },
    {
      step: 'contacts',
      title: t('onboarding.contacts.title'),
      lines: [
        [
          t('onboarding.contacts.relativeTitle'),
          draft.relativeName.trim()
            ? `${draft.relativeName.trim()} · ${draft.relativePhone.trim()}`
            : t('onboarding.summary.none'),
        ],
        [
          t('onboarding.contacts.doctorTitle'),
          draft.doctorName.trim()
            ? `${draft.doctorName.trim()} · ${draft.doctorPhone.trim()}`
            : t('onboarding.summary.none'),
        ],
      ],
    },
  ];

  return (
    <View style={{ gap: spacing.md }}>
      <Text tone="muted">{t('onboarding.summary.intro')}</Text>
      {sections.map((section, i) => (
        <Card key={section.step} index={i} variant="outlined">
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Text variant="subheading">{section.title}</Text>
            <Text
              variant="label"
              tone="primary"
              accessibilityRole="button"
              accessibilityLabel={`${t('onboarding.summary.edit')} : ${section.title}`}
              onPress={() => onEdit(section.step)}
            >
              {t('onboarding.summary.edit')}
            </Text>
          </View>
          {section.lines.map(([label, value]) => (
            <View
              key={label}
              style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}
            >
              <Text variant="bodySmall" tone="muted">
                {label}
              </Text>
              <Text variant="bodySmall" style={{ flexShrink: 1, textAlign: 'right' }}>
                {value}
              </Text>
            </View>
          ))}
        </Card>
      ))}
    </View>
  );
}
