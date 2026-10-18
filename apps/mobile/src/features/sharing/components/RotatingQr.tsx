// QR de partage et son compte à rebours (L5-07). Le QR est TOUJOURS noir sur blanc, même en thème sombre :
// c'est ce que les lecteurs de QR lisent le mieux (contraste maximal, marge blanche autour). Ce sont les
// deux seules couleurs fixes, voulues : elles ne suivent pas le thème.
// Quand le jeton affiché n'est plus valable (renouvellement impossible), le QR est masqué : on ne montre pas
// au médecin un QR qui échouera. « Réessayer » est alors dans le message d'alerte sous le QR, qui dit
// pourquoi. Le compte à rebours est dit en texte (« Nouveau QR dans 42 s »), pas seulement par la barre.
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '@/components/ui';
import { radii, spacing, useReducedMotion, useTheme } from '@/theme';
import { isTokenAlive, rotationProgress, secondsToNext, type RotationState } from '../rotation';

/** Taille du QR : assez grand pour être lu à bout de bras par la caméra d'un ordinateur portable. */
const QR_SIZE = 232;
const QR_INK = '#000000';
const QR_PAPER = '#FFFFFF';

export function RotatingQr({ state, now }: { state: RotationState; now: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const alive = isTokenAlive(state, now);
  const seconds = secondsToNext(state, now);
  const progress = useSharedValue(rotationProgress(state, now));

  // La barre se vide doucement d'une seconde à l'autre ; « réduire les animations » : saut direct.
  useEffect(() => {
    const target = rotationProgress(state, now);
    progress.value = reduced
      ? target
      : withTiming(target, { duration: target === 0 ? 0 : 950, easing: Easing.linear });
  }, [now, state, reduced, progress]);
  const barStyle = useAnimatedStyle(() => ({ width: `${(1 - progress.value) * 100}%` }));

  return (
    <View style={{ alignItems: 'center', gap: spacing.lg }}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={alive ? t('share.qr.qrA11y') : t('share.qr.expired')}
        style={{
          padding: spacing.lg,
          borderRadius: radii.lg,
          // Papier blanc pour le QR ; QR masqué : couleurs du thème.
          backgroundColor: alive ? QR_PAPER : colors.surfaceMuted,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        {alive ? (
          <QRCode
            value={state.token}
            size={QR_SIZE}
            color={QR_INK}
            backgroundColor={QR_PAPER}
            ecl="M"
          />
        ) : (
          <View
            style={{
              width: QR_SIZE,
              height: QR_SIZE,
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.md,
              paddingHorizontal: spacing.lg,
            }}
          >
            <Ionicons name="qr-code-outline" size={56} color={colors.textMuted} />
            <Text variant="bodyStrong" align="center">
              {t('share.qr.expired')}
            </Text>
          </View>
        )}
      </View>

      {alive ? (
        <View style={{ width: QR_SIZE + spacing.lg * 2, gap: spacing.sm }}>
          <View
            style={{
              height: 6,
              borderRadius: radii.pill,
              backgroundColor: colors.surfaceMuted,
              overflow: 'hidden',
            }}
          >
            <Animated.View
              style={[
                { height: '100%', backgroundColor: colors.primary, borderRadius: radii.pill },
                barStyle,
              ]}
            />
          </View>
          <View
            accessible
            accessibilityLabel={
              state.phase === 'renewing'
                ? t('share.qr.renewing')
                : t('share.qr.nextA11y', { count: seconds })
            }
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.xs,
            }}
          >
            <Ionicons name="refresh-outline" size={14} color={colors.textMuted} />
            <Text variant="caption" tone="muted">
              {state.phase === 'renewing'
                ? t('share.qr.renewing')
                : t('share.qr.next', { count: seconds })}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
