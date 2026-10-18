// QR de partage (L5-07, CDC F7 étape 4) : le QR à montrer au médecin, renouvelé avant chaque minute
// (rotation.ts), avec son compte à rebours, ce qui est partagé, et « Arrêter le partage ».
//  - Le jeton n'est jamais écrit sur le téléphone : il vient du partage en cours, gardé en mémoire (flow.ts).
//  - Quand le médecin a scanné, le serveur refuse les nouveaux QR (409) : l'écran passe à « QR scanné » avec
//    le médecin et l'heure de fin de l'accès (GET /shares/:id/status), et « Mettre fin à l'accès ». Le suivi
//    en direct (minuteur, fin détectée sans attendre) arrive avec L5-08.
//  - Fermer l'écran avant le scan arrête le partage (le QR ne sert plus). Après le scan, fermer ne coupe
//    PAS l'accès du médecin : seul « Mettre fin à l'accès » le fait.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { ShareStatusResponse } from '@glyka/shared';
import { Button, Card, InlineAlert, PressableScale, Screen, Text } from '@/components/ui';
import {
  RotatingQr,
  SHARE_CATEGORY_ORDER,
  shareFlow,
  sharingApi,
  useRotatingQr,
  useShareFlow,
} from '@/features/sharing';
import { enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';

export default function ShareActiveScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const share = useShareFlow();
  const qr = useRotatingQr(share);
  const [status, setStatus] = useState<ShareStatusResponse | null>(null);
  const [ending, setEnding] = useState(false);
  const [endFailed, setEndFailed] = useState(false);
  const [ended, setEnded] = useState(false);

  const phase = qr.state?.phase;
  const waiting = phase === 'showing' || phase === 'renewing' || phase === 'retrying';

  // QR scanné : qui consulte, et jusqu'à quand (une seule lecture ; le suivi en direct est L5-08).
  useEffect(() => {
    if (phase !== 'scanned' || !share) return;
    sharingApi
      .status(share.session.id)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [phase, share]);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/share'));

  /** Avant le scan : fermer = arrêter le partage (le QR ne sert plus). */
  const stopSharing = () => {
    qr.stop();
    if (share && waiting) void sharingApi.revoke(share.session.id).catch(() => undefined);
    shareFlow.clear();
    leave();
  };

  /** Après le scan : couper l'accès du médecin (confirmé par le serveur avant de l'afficher). */
  const endAccess = async () => {
    if (!share) return;
    setEnding(true);
    setEndFailed(false);
    try {
      await sharingApi.revoke(share.session.id);
      // Le partage en cours est gardé jusqu'à la fermeture de l'écran : le vider ici effacerait
      // « Accès terminé » au profit de « Aucun QR en cours » (défaut vu en vérification réelle).
      setEnded(true);
    } catch {
      setEndFailed(true);
    } finally {
      setEnding(false);
    }
  };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text variant="overline" tone="primary">
          {t('share.qr.overline')}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {waiting || !share ? t('share.qr.title') : t('share.qr.scannedTitle')}
        </Text>
      </View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={waiting ? t('share.qr.stop') : t('share.qr.close')}
        onPress={waiting ? stopSharing : leave}
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
  const until = status?.expiresAt
    ? new Date(status.expiresAt).toLocaleTimeString(i18n.language, {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;
  const doctor = status?.doctor ? `${status.doctor.firstName} ${status.doctor.lastName}` : null;

  return (
    <Screen>
      {header}

      {waiting ? (
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
      ) : ended || phase === 'ended' || (status && status.status !== 'ACTIVE') ? (
        <Card variant="outlined" index={0}>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />
            <Text variant="bodyStrong">{t('share.qr.ended.title')}</Text>
          </View>
          <Text tone="muted">{t('share.qr.ended.text')}</Text>
        </Card>
      ) : (
        <Card variant="tinted" index={0}>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <Ionicons name="checkmark-circle" size={22} color={colors.primaryText} />
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {doctor
                ? t('share.qr.scanned.byDoctor', { name: doctor })
                : t('share.qr.scanned.title')}
            </Text>
          </View>
          {until ? <Text tone="muted">{t('share.qr.scanned.until', { time: until })}</Text> : null}
          {endFailed ? (
            <InlineAlert tone="danger" message={t('share.qr.scanned.endFailed')} />
          ) : null}
          <Button
            label={t('share.qr.scanned.end')}
            variant="danger"
            loading={ending}
            onPress={() => void endAccess()}
          />
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

      {waiting ? (
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
      ) : (
        <Button
          label={t('share.qr.close')}
          variant="secondary"
          onPress={() => {
            if (ended || phase === 'ended') shareFlow.clear();
            leave();
          }}
        />
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
