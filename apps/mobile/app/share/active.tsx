// Partage en cours (L5-07 et L5-08, CDC F7 étapes 4 à 6) : le QR à montrer au médecin, puis le suivi en direct.
//  - L5-07 : QR renouvelé avant chaque minute (rotation.ts), compte à rebours, ce qui est partagé, « Arrêter
//    le partage ». Le jeton n'est jamais écrit sur le téléphone (partage en cours gardé en mémoire, flow.ts).
//  - L5-08 : l'état est suivi en direct (watch.ts, GET /shares/:id/status) : toutes les 3 s tant que le QR
//    attend, l'écran passe à « Dr X consulte votre dossier — expire dans 04:37 » presque aussitôt le scan ;
//    puis toutes les 10 s et à la fin du minuteur : « Accès terminé », expiré ou arrêté (même depuis un
//    autre appareil). « Mettre fin à l'accès » demande une confirmation, puis coupe l'accès tout de suite.
//  - Fermer l'écran avant le scan arrête le partage (le QR ne sert plus). Après le scan, fermer ne coupe
//    PAS l'accès du médecin : seul « Mettre fin à l'accès » le fait ; revenir sur l'écran le retrouve.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Button, Card, InlineAlert, PressableScale, Screen, Spinner, Text } from '@/components/ui';
import {
  LiveAccessCard,
  RotatingQr,
  SHARE_CATEGORY_ORDER,
  remainingSeconds,
  shareFlow,
  sharingApi,
  useRotatingQr,
  useShareFlow,
  useShareWatch,
} from '@/features/sharing';
import { enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';

export default function ShareActiveScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const share = useShareFlow();
  const qr = useRotatingQr(share);
  const watch = useShareWatch(share?.session.id ?? null);
  const [ending, setEnding] = useState(false);
  const [endFailed, setEndFailed] = useState(false);

  const phase = qr.state?.phase;
  const view = watch.state?.view ?? { kind: 'waiting' as const };
  const rotating = phase === 'showing' || phase === 'renewing' || phase === 'retrying';
  // Le QR n'est montré que tant que le serveur dit « en attente » ET que la rotation tourne.
  const showQr = view.kind === 'waiting' && rotating;

  // Scanné ou terminé : plus besoin de QR. La rotation s'arrête dès que le suivi le voit…
  const { stop: stopQr } = qr;
  useEffect(() => {
    if (view.kind !== 'waiting') stopQr();
  }, [view.kind, stopQr]);
  // … et si la rotation le voit d'abord (409 ou 404), le suivi relit l'état tout de suite.
  const { refresh } = watch;
  useEffect(() => {
    if (phase === 'scanned' || phase === 'ended') refresh();
  }, [phase, refresh]);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/share'));

  /** Avant le scan : fermer = arrêter le partage (le QR ne sert plus). */
  const stopSharing = () => {
    qr.stop();
    if (share) void sharingApi.revoke(share.session.id).catch(() => undefined);
    shareFlow.clear();
    leave();
  };

  /** Après le scan : couper l'accès du médecin, puis relire l'état (« Accès terminé : arrêté »). */
  const endAccess = async () => {
    if (!share) return;
    setEnding(true);
    setEndFailed(false);
    try {
      await sharingApi.revoke(share.session.id);
      watch.refresh();
    } catch {
      setEndFailed(true);
    } finally {
      setEnding(false);
    }
  };

  /** Fin de l'accès : le partage en cours n'a plus d'usage. */
  const newQr = () => {
    shareFlow.clear();
    router.replace('/share/new');
  };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text variant="overline" tone="primary">
          {t('share.qr.overline')}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {showQr || !share ? t('share.qr.title') : t('share.qr.scannedTitle')}
        </Text>
      </View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={showQr ? t('share.qr.stop') : t('share.qr.close')}
        onPress={showQr ? stopSharing : leave}
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

  // Aucun partage en cours (application rouverte, partage déjà arrêté…).
  if (!share || !qr.state) {
    return (
      <Screen>
        {header}
        <Card variant="outlined" index={0}>
          <Text variant="bodyStrong">{t('share.qr.none.title')}</Text>
          <Text tone="muted">{t('share.qr.none.text')}</Text>
        </Card>
        <Button
          label={t('share.qr.none.action')}
          icon={<Ionicons name="qr-code-outline" size={20} color={colors.onPrimary} />}
          onPress={() => router.replace('/share/new')}
        />
      </Screen>
    );
  }

  const categories = SHARE_CATEGORY_ORDER.filter((c) => share.session.categories.includes(c))
    .map((c) => t(`share.category.${c}.label`))
    .join(' · ');
  const clock = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })
      : null;

  return (
    <Screen>
      {header}

      {showQr ? (
        <>
          <Text tone="muted">{t('share.qr.intro')}</Text>
          <Animated.View entering={enterFromBelow(0, reduced)}>
            <RotatingQr state={qr.state} now={qr.now} />
          </Animated.View>
          {phase === 'retrying' && qr.state.problem ? (
            <InlineAlert
              tone="warning"
              title={t(`share.qr.problem.${qr.state.problem}.title`)}
              message={t(`share.qr.problem.${qr.state.problem}.text`)}
              actionLabel={t('common.retry')}
              onAction={qr.retryNow}
            />
          ) : null}
        </>
      ) : view.kind === 'active' ? (
        <LiveAccessCard
          doctor={view.doctor}
          // Heure actuelle, pas `qr.now` (qui peut avoir jusqu'à 1 s de retard : « 30:01 » vu en vérification
          // pour un accès de 30 min). Le rendu est relancé chaque seconde par l'horloge de l'écran.
          seconds={remainingSeconds(view.endsAt, Date.now())}
          until={clock(view.expiresAt)}
          ending={ending}
          endFailed={endFailed}
          offline={watch.state?.problem === 'offline'}
          onEnd={() => void endAccess()}
        />
      ) : view.kind === 'ended' ? (
        <Card variant="outlined" index={0}>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />
            <Text variant="bodyStrong">{t('share.qr.ended.title')}</Text>
          </View>
          <Text tone="muted">
            {view.doctor
              ? t(`share.live.ended.${view.reason}`, {
                  name: `${view.doctor.firstName} ${view.doctor.lastName}`,
                })
              : t(`share.live.ended.${view.reason}NoName`)}
          </Text>
          <Text tone="muted">{t('share.qr.ended.text')}</Text>
        </Card>
      ) : (
        // Le QR vient d'être refusé (scanné) : le suivi confirme dans un instant.
        <Card variant="outlined" index={0} style={{ alignItems: 'center', gap: spacing.sm }}>
          <Spinner />
          <Text tone="muted">{t('share.live.checking')}</Text>
        </Card>
      )}

      <Card variant="outlined" index={1} style={{ gap: spacing.sm }}>
        <SummaryLine icon="eye-outline" label={t('share.qr.shared')} value={categories} />
        <SummaryLine
          icon="time-outline"
          label={t('share.qr.duration')}
          value={t('share.qr.durationValue', {
            duration: t(`share.duration.${share.session.duration}.label`),
          })}
        />
      </Card>

      {showQr ? (
        <View style={{ gap: spacing.sm }}>
          <Button
            label={t('share.qr.stop')}
            variant="secondary"
            icon={<Ionicons name="stop-circle-outline" size={20} color={colors.primaryText} />}
            onPress={stopSharing}
          />
          <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }}>
            <Ionicons
              name="shield-checkmark-outline"
              size={14}
              color={colors.textMuted}
              style={{ marginTop: 2 }}
            />
            <Text variant="caption" tone="muted" style={{ flex: 1 }}>
              {t('share.qr.doctorNote')}
            </Text>
          </View>
        </View>
      ) : view.kind === 'ended' ? (
        <View style={{ gap: spacing.sm }}>
          <Button
            label={t('share.live.newQr')}
            icon={<Ionicons name="qr-code-outline" size={20} color={colors.onPrimary} />}
            onPress={newQr}
          />
          <Button
            label={t('share.qr.close')}
            variant="secondary"
            onPress={() => {
              shareFlow.clear();
              leave();
            }}
          />
        </View>
      ) : (
        <Button label={t('share.qr.close')} variant="secondary" onPress={leave} />
      )}
    </Screen>
  );
}

function SummaryLine({
  icon,
  label,
  value,
}: {
  icon: 'eye-outline' | 'time-outline';
  label: string;
  value: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={18} color={colors.primaryText} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text variant="caption" tone="muted">
          {label}
        </Text>
        <Text variant="bodySmall">{value}</Text>
      </View>
    </View>
  );
}
