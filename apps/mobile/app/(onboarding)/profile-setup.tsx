// Assistant de profil (L1-08) : 4 étapes + résumé, puis enregistrement (PUT /me/profile, L1-05).
//   1. Qui êtes-vous ?   prénom, nom, date de naissance, sexe            (obligatoire)
//   2. Votre diabète     type (obligatoire), année du diagnostic (facultative)
//   3. Unité et seuils   unité préférée, plage cible et seuils (valeurs par défaut « à définir avec votre médecin »)
//   4. Vos contacts      un proche et/ou le médecin traitant (facultatifs, mais complets s'ils sont commencés) ;
//                        en cas d'urgence : pays et numéro d'urgence saisis par la personne (facultatifs, L9-04)
//   5. Résumé            vérifier, modifier une étape, enregistrer
// On ne passe à l'étape suivante que si l'étape est valide (mêmes règles que le serveur).
// Chaque étape apparaît en glissant ; la barre de progression se remplit.
//
// Mode MODIFICATION (« Mon profil médical » → Modifier, paramètre `edit=1`) : le profil enregistré est lu
// sur le compte et devient le brouillon (profileToDraft) ; l'assistant s'ouvre sur l'étape demandée (`step`) ou
// sur le résumé ; « Suivant » et « Retour » ramènent au résumé ; à la fin, retour à l'onglet Profil.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type TextInput } from 'react-native';
import Animated, { FadeIn, SlideInLeft, SlideInRight } from 'react-native-reanimated';
import {
  Button,
  Card,
  ChoiceGroup,
  InlineAlert,
  Screen,
  SkeletonCard,
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
  SUGGESTED_COUNTRIES,
  ProfileSummary,
  StepProgress,
  ThresholdsEditor,
  finalPayload,
  fetchProfile,
  firstInvalidStep,
  initialDraft,
  loadProblem,
  maskBirthDate,
  profileApi,
  profileToDraft,
  saveThresholds,
  validateStep,
  type CountryChoice,
  type ProfileDraft,
  type Step,
  type StepErrors,
} from '@/features/profile';
import { durations, easing, spacing, useReducedMotion } from '@/theme';

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
  const params = useLocalSearchParams<{ edit?: string; step?: string }>();
  const editing = params.edit === '1';
  /** Mode modification : lecture du profil enregistré (prêt tout de suite pour un nouveau profil). */
  const [loading, setLoading] = useState<'loading' | 'ready' | ReturnType<typeof loadProblem>>(
    editing ? 'loading' : 'ready',
  );
  const lastNameRef = useRef<TextInput>(null);
  const birthRef = useRef<TextInput>(null);

  const loadProfile = async () => {
    setLoading('loading');
    try {
      const profile = await fetchProfile(); // attend le réveil du serveur s'il dormait
      setDraft(profileToDraft(profile));
      const requested = STEPS.indexOf(params.step as Step);
      setIndex(requested >= 0 ? requested : FORM_STEPS);
      setLoading('ready');
    } catch (error) {
      setLoading(loadProblem(error));
    }
  };

  useEffect(() => {
    if (editing) void loadProfile();
    // Une seule lecture, à l'ouverture de l'écran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // Modification : une étape corrigée ramène directement au résumé.
    goTo(editing ? FORM_STEPS : index + 1);
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
    // Modification : retour à l'onglet Profil, qui relit le profil enregistré.
    if (editing) {
      router.back();
      return;
    }
    await markProfileCompleted(); // l'accueil devient accessible (session, L1-07)
    router.replace('/(tabs)');
  };

  if (loading !== 'ready') {
    return (
      <Screen>
        <View style={{ gap: spacing.sm }}>
          <Text variant="overline" tone="primary">
            {t('onboarding.edit.overline')}
          </Text>
          <Text variant="title" accessibilityRole="header">
            {t('onboarding.edit.title')}
          </Text>
        </View>
        {loading === 'loading' ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <InlineAlert
              tone={loading === 'error' ? 'danger' : 'info'}
              message={t(`profile.medical.${loading}`)}
            />
            <Button label={t('common.retry')} onPress={() => void loadProfile()} />
            <Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />
          </>
        )}
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen>
        <SuccessState
          title={
            editing
              ? t('onboarding.edit.doneTitle')
              : t('onboarding.done.title', { name: draft.firstName.trim() })
          }
          message={editing ? t('onboarding.edit.doneMessage') : t('onboarding.done.message')}
          actionLabel={editing ? t('onboarding.edit.doneAction') : t('onboarding.done.action')}
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
            {editing ? t('onboarding.edit.overline') : t('onboarding.summary.overline')}
          </Text>
          <Text variant="title" accessibilityRole="header">
            {editing ? t('onboarding.edit.title') : t('onboarding.summary.title')}
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
            <ThresholdsEditor
              value={{
                unit: draft.unit,
                thresholds: draft.thresholds,
                reviewed: draft.thresholdsReviewedByClinician,
              }}
              onChange={({ reviewed, ...patch }) =>
                update({
                  ...patch,
                  ...(reviewed !== undefined ? { thresholdsReviewedByClinician: reviewed } : {}),
                })
              }
              error={err}
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
            {/* L9-04 : l'assistant affichera ce numéro en cas d'urgence, avec le médecin et le proche. */}
            <Card variant="outlined" animateIn={false}>
              <Text variant="subheading">{t('onboarding.contacts.emergencyTitle')}</Text>
              <Text variant="bodySmall" tone="muted">
                {t('onboarding.contacts.emergencyHint')}
              </Text>
              <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
                <ChoiceGroup<CountryChoice>
                  label={t('onboarding.contacts.country')}
                  options={[...SUGGESTED_COUNTRIES, 'OTHER' as const].map((code) => ({
                    value: code,
                    label: t(`onboarding.contacts.countries.${code}`),
                  }))}
                  value={draft.country}
                  onChange={(country) => update({ country })}
                  error={draft.country === 'OTHER' ? undefined : err('country')}
                  columns={3}
                />
                {draft.country === 'OTHER' ? (
                  <TextField
                    label={t('onboarding.contacts.otherCountry')}
                    hint={t('onboarding.contacts.otherCountryHint')}
                    placeholder="KE"
                    value={draft.otherCountry}
                    onChangeText={(otherCountry) => update({ otherCountry })}
                    error={err('country')}
                    autoCapitalize="characters"
                    maxLength={2}
                  />
                ) : null}
                {draft.country !== null ? (
                  <Button
                    label={t('onboarding.contacts.clearCountry')}
                    variant="ghost"
                    onPress={() => update({ country: null, otherCountry: '' })}
                  />
                ) : null}
                <TextField
                  label={t('onboarding.contacts.emergencyNumber')}
                  hint={t('onboarding.contacts.emergencyNumberHint')}
                  placeholder={t('onboarding.contacts.emergencyNumberPlaceholder')}
                  value={draft.emergencyNumber}
                  onChangeText={(emergencyNumber) => update({ emergencyNumber })}
                  error={err('emergencyNumber')}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                />
              </View>
            </Card>
          </>
        ) : null}

        {step === 'summary' ? (
          <>
            <ProfileSummary
              draft={draft}
              intro={editing ? t('onboarding.edit.intro') : t('onboarding.summary.intro')}
              onEdit={(s) => goTo(STEPS.indexOf(s))}
            />
            {/* Rappel avant d'enregistrer : les seuils servent au suivi, pas à décider d'un traitement. */}
            <MedicalDisclaimer index={4} />
          </>
        ) : null}
      </Animated.View>

      {/* Navigation */}
      <View style={{ gap: spacing.sm, marginTop: 'auto' }}>
        {step === 'summary' ? (
          <Button
            label={editing ? t('onboarding.edit.save') : t('onboarding.summary.save')}
            size="lg"
            loading={saving}
            onPress={save}
          />
        ) : (
          <Button
            label={
              editing || index === FORM_STEPS - 1 ? t('onboarding.review') : t('onboarding.next')
            }
            size="lg"
            onPress={next}
          />
        )}
        {editing ? (
          // Modification : depuis une étape, « Retour » revient au résumé (sans garder l'étape en cours si
          // elle n'est pas valide) ; depuis le résumé, « Annuler » quitte sans rien enregistrer.
          <Button
            label={step === 'summary' ? t('common.cancel') : t('common.back')}
            variant="ghost"
            disabled={saving}
            onPress={() => (step === 'summary' ? router.back() : goTo(FORM_STEPS))}
          />
        ) : index > 0 ? (
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
