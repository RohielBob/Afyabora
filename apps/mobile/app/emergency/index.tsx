// « Carte d'urgence » (L6-06, CDC F10) : une fiche minimale pour les secours, séparée du partage médical.
//  - Activer / désactiver : désactivée, le QR ne montre plus rien, immédiatement (même imprimé).
//    Activer une carte sans QR sur ce téléphone en génère un dans la foulée (choix de l'équipe).
//  - Le QR, en image prête à exporter (fond d'écran, impression) : aucun nom ni donnée de santé dessus.
//  - « Nouveau QR » avec confirmation : l'ancien cesse de marcher (copies imprimées comprises).
//  - « Ce que verra le secouriste » : seulement les champs remplis ; « Modifier ma carte ».
//  - Chaque ouverture est inscrite dans « Qui a consulté mes données » et notifiée : c'est dit ici.
//  - Sans réseau : on le dit ; un QR déjà gardé sur le téléphone reste affiché (il marche toujours).
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import {
  Button,
  Card,
  InlineAlert,
  ListRow,
  PressableScale,
  Screen,
  SkeletonCard,
  Text,
  Toggle,
} from '@/components/ui';
import { useSession } from '@/features/auth';
import {
  CardPreview,
  EmergencyQrImage,
  previewLines,
  shareQrImage,
  useEmergencyCard,
  type CardProblem,
  type EmergencyQrImageHandle,
  type QrStatus,
} from '@/features/emergency';
import { readUnit } from '@/features/measurements';
import { enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';

/** Largeur maximale de l'image du QR à l'écran. */
const MAX_IMAGE_WIDTH = 340;

export default function EmergencyScreen() {
  const session = useSession();
  const userId = session.status === 'signedIn' ? session.user.id : '';
  return userId ? <EmergencyContent userId={userId} /> : null;
}

function EmergencyContent({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const unit = readUnit();
  const { state, busy, actionProblem, reload, setEnabled, regenerate } = useEmergencyCard(userId);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/share'));

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="overline" tone="primary">
            {t('emergency.overline')}
          </Text>
          <Text variant="title" accessibilityRole="header">
            {t('emergency.title')}
          </Text>
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('emergency.close')}
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
      <Text tone="muted">{t('emergency.intro')}</Text>

      {state.status === 'loading' ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : null}

      {state.status === 'failed' ? (
        <>
          <ProblemAlert problem={state.problem} onRetry={() => void reload()} />
          {state.qr?.kind === 'ready' ? <QrBlock qr={state.qr} /> : null}
        </>
      ) : null}

      {state.status === 'ready' ? (
        <>
          <StatusCard
            enabled={state.card.enabled}
            empty={previewLines(state.card, unit).length === 0}
            busy={busy === 'enable' || busy === 'disable'}
            onChange={(value) => void setEnabled(value)}
          />

          {actionProblem ? (
            <ProblemAlert problem={actionProblem} onRetry={() => void reload()} />
          ) : null}

          {state.card.enabled ? (
            state.qr.kind === 'ready' ? (
              <>
                <QrBlock qr={state.qr} />
                <RegenerateButton
                  busy={busy === 'regenerate'}
                  onConfirm={() => void regenerate()}
                />
              </>
            ) : (
              <InlineAlert
                tone="info"
                title={t('emergency.qr.elsewhere.title')}
                message={t('emergency.qr.elsewhere.text')}
                actionLabel={t('emergency.qr.elsewhere.action')}
                onAction={() => void regenerate()}
              />
            )
          ) : null}

          <Animated.View entering={enterFromBelow(2, reduced)} style={{ gap: spacing.sm }}>
            <CardPreview card={state.card} unit={unit} index={2} />
            <Button
              label={t('emergency.editCard')}
              variant="outline"
              icon={<Ionicons name="create-outline" size={18} color={colors.primaryText} />}
              onPress={() => router.push('/emergency/edit')}
            />
          </Animated.View>

          <Card variant="outlined" index={3} style={{ padding: 6, gap: 0 }}>
            <ListRow
              icon={<Ionicons name="eye-outline" size={20} color={colors.primaryText} />}
              title={t('emergency.log.title')}
              subtitle={t('emergency.log.text')}
              onPress={() => router.push('/share/log')}
            />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

/** Carte active ou non : icône + mot (jamais la couleur seule) et interrupteur. */
function StatusCard({
  enabled,
  empty,
  busy,
  onChange,
}: {
  enabled: boolean;
  empty: boolean;
  busy: boolean;
  onChange: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const tone = enabled ? colors.success : colors.textMuted;
  return (
    <Card variant={enabled ? 'tinted' : 'outlined'} index={0} style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Ionicons
          name={enabled ? 'shield-checkmark' : 'pause-circle-outline'}
          size={22}
          color={tone}
        />
        <Text variant="subheading" style={{ flex: 1 }}>
          {t(enabled ? 'emergency.status.on' : 'emergency.status.off')}
        </Text>
      </View>
      <Text variant="bodySmall" tone="muted">
        {t(enabled ? 'emergency.status.onText' : 'emergency.status.offText')}
      </Text>
      <Toggle
        value={enabled}
        onChange={onChange}
        label={t('emergency.status.toggle')}
        hint={empty && !enabled ? t('emergency.status.emptyHint') : undefined}
        disabled={busy || (empty && !enabled)}
      />
    </Card>
  );
}

/** Le QR en image, et « Enregistrer en image ». */
function QrBlock({ qr }: { qr: Extract<QrStatus, { kind: 'ready' }> }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width: screen } = useWindowDimensions();
  const image = useRef<EmergencyQrImageHandle>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProblem, setExportProblem] = useState(false);
  const width = Math.min(MAX_IMAGE_WIDTH, screen - spacing.lg * 4);

  const exportImage = async () => {
    setExporting(true);
    setExportProblem(false);
    try {
      const png = await image.current?.toPng();
      if (!png || !(await shareQrImage(png, t('emergency.qr.shareTitle')))) setExportProblem(true);
    } catch {
      setExportProblem(true);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card variant="outlined" index={1} style={{ gap: spacing.md, alignItems: 'center' }}>
      <View
        style={{
          borderRadius: radii.lg,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <EmergencyQrImage
          ref={image}
          url={qr.url}
          width={width}
          title={t('emergency.image.title')}
          instruction={t('emergency.image.instruction')}
          audience={t('emergency.image.audience')}
          accessibilityLabel={t('emergency.image.a11y')}
        />
      </View>
      <Text variant="caption" tone="muted" style={{ textAlign: 'center' }}>
        {t('emergency.qr.hint')}
      </Text>
      <Button
        label={t('emergency.qr.export')}
        loading={exporting}
        icon={<Ionicons name="image-outline" size={20} color={colors.onPrimary} />}
        onPress={() => void exportImage()}
      />
      {exportProblem ? (
        <InlineAlert
          tone="warning"
          title={t('emergency.qr.exportProblem.title')}
          message={t('emergency.qr.exportProblem.text')}
        />
      ) : null}
    </Card>
  );
}

/** « Nouveau QR » : confirmation d'abord (l'ancien, même imprimé, cesse de marcher). */
function RegenerateButton({ busy, onConfirm }: { busy: boolean; onConfirm: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [asking, setAsking] = useState(false);
  if (asking) {
    return (
      <Card variant="outlined" style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
          <Ionicons name="warning-outline" size={20} color={colors.warning} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{t('emergency.qr.confirm.title')}</Text>
            <Text variant="bodySmall" tone="muted">
              {t('emergency.qr.confirm.text')}
            </Text>
          </View>
        </View>
        <Button
          label={t('emergency.qr.confirm.yes')}
          loading={busy}
          onPress={() => {
            onConfirm();
            setAsking(false);
          }}
        />
        <Button
          label={t('emergency.qr.confirm.no')}
          variant="ghost"
          onPress={() => setAsking(false)}
        />
      </Card>
    );
  }
  return (
    <Button
      label={t('emergency.qr.regenerate')}
      variant="ghost"
      loading={busy}
      icon={<Ionicons name="refresh" size={18} color={colors.primaryText} />}
      onPress={() => setAsking(true)}
    />
  );
}

function ProblemAlert({ problem, onRetry }: { problem: CardProblem; onRetry: () => void }) {
  const { t } = useTranslation();
  const retry =
    problem === 'noProfile' ? {} : { actionLabel: t('common.retry'), onAction: onRetry };
  return (
    <InlineAlert
      tone={problem === 'error' ? 'danger' : 'warning'}
      title={t(`emergency.problem.${problem}.title`)}
      message={t(`emergency.problem.${problem}.text`)}
      {...retry}
    />
  );
}
