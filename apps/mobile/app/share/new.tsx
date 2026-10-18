// « Partager mon historique » (L5-06, CDC F7 étapes 2 et 3) : le patient coche ce que le médecin pourra voir
// et choisit la durée de l'accès, puis « Générer le QR » crée la session (POST /shares). Ensuite : l'écran
// du QR (L5-07). Rien n'est partagé tant que le médecin n'a pas scanné.
//  - Notes personnelles et téléchargement du rapport : décochés au départ (choix du patient).
//  - Au moins une catégorie : sinon le bouton reste inactif, et l'écran dit pourquoi.
//  - Sans réseau : message clair tout de suite, sans attendre l'échec de la requête.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { ShareCategory, ShareDuration } from '@glyka/shared';
import { Button, ChoiceGroup, InlineAlert, PressableScale, Screen, Text } from '@/components/ui';
import {
  CATEGORY_ICONS,
  CategoryOption,
  DEFAULT_SHARE_CATEGORIES,
  DEFAULT_SHARE_DURATION,
  SENSITIVE_CATEGORIES,
  SHARE_CATEGORY_ORDER,
  SHARE_DURATION_ORDER,
  buildShareInput,
  createProblem,
  shareFlow,
  sharingApi,
  toggleCategory,
  type CreateProblem,
} from '@/features/sharing';
import { isOnline } from '@/features/sync';
import { enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';

export default function ShareNewScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [selected, setSelected] = useState<ShareCategory[]>([...DEFAULT_SHARE_CATEGORIES]);
  const [duration, setDuration] = useState<ShareDuration>(DEFAULT_SHARE_DURATION);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<CreateProblem | null>(null);

  const input = buildShareInput(selected, duration);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/share'));

  const create = async () => {
    if (!input) return;
    setProblem(null);
    setSending(true);
    try {
      if (!(await isOnline())) {
        setProblem({ kind: 'offline' });
        return;
      }
      shareFlow.created(await sharingApi.create(input));
      router.replace('/share/active');
    } catch (error) {
      setProblem(createProblem(error));
    } finally {
      setSending(false);
    }
  };

  const durationOptions = SHARE_DURATION_ORDER.map((value) => ({
    value,
    label: t(`share.duration.${value}.label`),
    hint: t(`share.duration.${value}.hint`),
  }));

  return (
    <Screen>
      {/* En-tête : titre + fermer (sans rien partager). */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="overline" tone="primary">
            {t('share.new.overline')}
          </Text>
          <Text variant="title" accessibilityRole="header">
            {t('share.new.title')}
          </Text>
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('share.new.close')}
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
      <Text tone="muted">{t('share.new.intro')}</Text>

      <Animated.View entering={enterFromBelow(0, reduced)} style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
          <Text variant="subheading" accessibilityRole="header" style={{ flex: 1 }}>
            {t('share.new.what')}
          </Text>
          <Text variant="caption" tone="muted">
            {t('share.new.count', { count: selected.length, total: SHARE_CATEGORY_ORDER.length })}
          </Text>
        </View>
        {SHARE_CATEGORY_ORDER.map((category) => (
          <CategoryOption
            key={category}
            icon={CATEGORY_ICONS[category]}
            label={t(`share.category.${category}.label`)}
            description={t(`share.category.${category}.text`)}
            checked={selected.includes(category)}
            note={
              SENSITIVE_CATEGORIES.includes(category)
                ? t(`share.category.${category}.note`)
                : undefined
            }
            onToggle={() => {
              setProblem(null);
              setSelected((current) => toggleCategory(current, category));
            }}
          />
        ))}
        {selected.length === 0 ? (
          <InlineAlert tone="info" message={t('share.new.noneSelected')} />
        ) : null}
      </Animated.View>

      <Animated.View entering={enterFromBelow(1, reduced)} style={{ gap: spacing.sm }}>
        <Text variant="subheading" accessibilityRole="header">
          {t('share.new.howLong')}
        </Text>
        <ChoiceGroup
          label={t('share.new.durationLabel')}
          options={durationOptions}
          value={duration}
          onChange={(value) => {
            setProblem(null);
            setDuration(value);
          }}
        />
        <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }}>
          <Ionicons
            name="timer-outline"
            size={14}
            color={colors.textMuted}
            style={{ marginTop: 2 }}
          />
          <Text variant="caption" tone="muted" style={{ flex: 1 }}>
            {t('share.new.startsAtScan')}
          </Text>
        </View>
      </Animated.View>

      {problem ? <CreateProblemAlert problem={problem} onRetry={() => void create()} /> : null}

      <Animated.View entering={enterFromBelow(2, reduced)} style={{ gap: spacing.sm }}>
        <Button
          label={t('share.new.generate')}
          size="lg"
          disabled={!input}
          loading={sending}
          icon={<Ionicons name="qr-code-outline" size={20} color={colors.onPrimary} />}
          accessibilityHint={input ? undefined : t('share.new.noneSelected')}
          onPress={() => void create()}
        />
        <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }}>
          <Ionicons
            name="shield-checkmark-outline"
            size={14}
            color={colors.textMuted}
            style={{ marginTop: 2 }}
          />
          <Text variant="caption" tone="muted" style={{ flex: 1 }}>
            {t('share.new.qrNote')}
          </Text>
        </View>
      </Animated.View>
    </Screen>
  );
}

/** Échec de la création du QR : explication, et « Réessayer » quand réessayer a un sens. */
function CreateProblemAlert({ problem, onRetry }: { problem: CreateProblem; onRetry: () => void }) {
  const { t } = useTranslation();
  const retry = { actionLabel: t('common.retry'), onAction: onRetry };
  switch (problem.kind) {
    case 'offline':
    case 'tooMany':
    case 'busy':
      return (
        <InlineAlert
          tone="warning"
          title={t(`share.problem.${problem.kind}.title`)}
          message={t(`share.problem.${problem.kind}.text`)}
          {...retry}
        />
      );
    // Le serveur explique quoi faire (ex. « Complétez votre profil médical avant de partager… »).
    case 'rejected':
      return (
        <InlineAlert
          tone="danger"
          title={t('share.problem.rejected.title')}
          message={problem.detail}
        />
      );
    default:
      return (
        <InlineAlert
          tone="danger"
          title={t('share.problem.error.title')}
          message={t('share.problem.error.text')}
          {...retry}
        />
      );
  }
}
