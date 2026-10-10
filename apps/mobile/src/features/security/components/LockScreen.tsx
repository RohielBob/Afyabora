// Écran de verrouillage (L1-09), affiché PAR-DESSUS l'app tant qu'elle est verrouillée : rien de l'app
// n'est visible derrière. Déverrouillage par empreinte / visage (proposé tout de suite si activé) ou par code.
// Après 5 erreurs : attente affichée en direct. « Code oublié ? » : se déconnecter (avec confirmation).
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import { LogoMark } from '@/components/brand';
import { Button, InlineAlert, PressableScale, Text } from '@/components/ui';
import { durations, radii, spacing, useTheme } from '@/theme';
import { unlockWithBiometrics, unlockWithPin, useAppLock } from '../app-lock';
import { authenticateWithBiometrics, biometricSupport, type BiometricKind } from '../biometrics';
import { secondsBlocked } from '../lock-rules';
import { PinPad, type PinPadHandle } from './PinPad';

export function LockScreen({
  pinLength,
  onForgot,
}: {
  pinLength: number;
  /** « Code oublié » : se déconnecter (fourni par l'app : la sécurité ne dépend pas de la session). */
  onForgot: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { settings, attempts } = useAppLock();
  const pad = useRef<PinPadHandle>(null);
  const [bio, setBio] = useState<BiometricKind | null>(null);
  const [now, setNow] = useState(Date.now());
  const [wrong, setWrong] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const wait = secondsBlocked(attempts, now);

  // Compte à rebours de l'attente.
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [wait, now]);

  const askBiometrics = useCallback(async () => {
    const ok = await authenticateWithBiometrics(
      t('security.lock.bioPrompt'),
      t('security.lock.useCode'),
    );
    if (ok) await unlockWithBiometrics();
  }, [t]);

  // Empreinte / visage proposés tout de suite, si activés et disponibles.
  useEffect(() => {
    if (!settings.biometrics) return;
    void biometricSupport().then((support) => {
      if (!support.available) return;
      setBio(support.kind);
      void askBiometrics();
    });
  }, [settings.biometrics, askBiometrics]);

  const onPin = async (pin: string) => {
    if (await unlockWithPin(pin)) return;
    setWrong(true);
    setNow(Date.now());
    pad.current?.reject();
  };

  const bioIcon = bio === 'face' ? 'scan-outline' : 'finger-print';

  return (
    <Animated.View
      // Pas de fondu d'apparition : pendant un fondu, l'app (données de santé) serait visible derrière.
      // L'écran apparaît d'un coup, opaque ; seul le départ (déverrouillage) est animé.
      exiting={FadeOut.duration(durations.base)}
      accessibilityViewIsModal
      style={[
        StyleSheet.absoluteFill,
        {
          zIndex: 20,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.xl,
          gap: spacing.xl,
        },
      ]}
    >
      <View style={{ alignItems: 'center', gap: spacing.sm }}>
        <LogoMark size={56} />
        <Text variant="heading" accessibilityRole="header">
          {t('security.lock.title')}
        </Text>
        <Text tone="muted" align="center">
          {wait > 0
            ? t('security.lock.wait', { seconds: wait })
            : wrong
              ? t('security.lock.wrong')
              : t('security.lock.prompt')}
        </Text>
      </View>

      <PinPad
        ref={pad}
        length={pinLength}
        onComplete={(pin) => void onPin(pin)}
        disabled={wait > 0}
        leftKey={
          bio ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={t(
                bio === 'face' ? 'security.lock.useFace' : 'security.lock.useFinger',
              )}
              onPress={() => void askBiometrics()}
              style={{
                width: 76,
                height: 76,
                borderRadius: radii.pill,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={bioIcon} size={32} color={colors.primaryText} />
            </PressableScale>
          ) : null
        }
      />

      {forgot ? (
        <View style={{ width: '100%', maxWidth: 420, gap: spacing.sm }}>
          <InlineAlert
            tone="warning"
            title={t('security.lock.forgotTitle')}
            message={t('security.lock.forgotText')}
          />
          <Button
            label={t('security.lock.forgotConfirm')}
            variant="danger"
            loading={leaving}
            onPress={async () => {
              setLeaving(true);
              await onForgot();
            }}
          />
          <Button label={t('common.cancel')} variant="ghost" onPress={() => setForgot(false)} />
        </View>
      ) : (
        <Button
          label={t('security.lock.forgot')}
          variant="ghost"
          fullWidth={false}
          style={{ alignSelf: 'center' }}
          onPress={() => setForgot(true)}
        />
      )}
    </Animated.View>
  );
}
