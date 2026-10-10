// Saisie du code : des points qui se remplissent + un pavé numérique de grandes touches.
// Erreur : les points tremblent (secousse horizontale courte) et se vident. Touche « effacer » et touche
// optionnelle à gauche (ex. empreinte). Les touches réagissent au toucher (léger enfoncement).
import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { PressableScale, Text } from '@/components/ui';
import { radii, spacing, springs, useReducedMotion, useTheme } from '@/theme';

export interface PinPadHandle {
  /** Erreur : secousse + effacement. */
  reject: () => void;
  clear: () => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export const PinPad = forwardRef<
  PinPadHandle,
  {
    /** Longueur attendue : le code est envoyé dès qu'elle est atteinte. */
    length: number;
    onComplete: (pin: string) => void;
    disabled?: boolean;
    /** Contenu de la touche en bas à gauche (ex. bouton empreinte). */
    leftKey?: ReactNode;
  }
>(function PinPad({ length, onComplete, disabled, leftKey }, ref) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [pin, setPinState] = useState('');
  // Valeur à jour du code, lue par chaque touche : avec des touches très rapides, l'état React n'est pas
  // encore redessiné entre deux appuis (sinon des chiffres seraient perdus).
  const current = useRef('');
  const setPin = (value: string) => {
    current.current = value;
    setPinState(value);
  };
  const shake = useSharedValue(0);

  useImperativeHandle(ref, () => ({
    reject: () => {
      if (!reduced) {
        shake.value = withSequence(
          withTiming(-10, { duration: 50 }),
          withTiming(10, { duration: 50 }),
          withTiming(-7, { duration: 50 }),
          withTiming(7, { duration: 50 }),
          withSpring(0, springs.press),
        );
      }
      setTimeout(() => setPin(''), reduced ? 0 : 260);
    },
    clear: () => setPin(''),
  }));

  const dotsStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const press = (digit: string) => {
    if (disabled || current.current.length >= length) return;
    const next = current.current + digit;
    setPin(next);
    if (next.length === length) onComplete(next);
  };

  const key = (content: ReactNode, onPress: () => void, label: string) => (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 76,
        height: 76,
        borderRadius: radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceMuted,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {content}
    </PressableScale>
  );

  return (
    <View style={{ alignItems: 'center', gap: spacing.xl }}>
      <Animated.View
        accessible
        accessibilityLabel={t('security.pad.progress', { count: pin.length, total: length })}
        style={[{ flexDirection: 'row', gap: spacing.md }, dotsStyle]}
      >
        {Array.from({ length }, (_, i) => (
          <View
            key={i}
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              borderWidth: 2,
              borderColor: colors.primary,
              backgroundColor: i < pin.length ? colors.primary : 'transparent',
            }}
          />
        ))}
      </Animated.View>

      <View
        style={{
          width: 76 * 3 + spacing.lg * 2,
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.lg,
        }}
      >
        {KEYS.map((d) => (
          <View key={d}>{key(<Text variant="title">{d}</Text>, () => press(d), d)}</View>
        ))}
        <View style={{ width: 76, height: 76, alignItems: 'center', justifyContent: 'center' }}>
          {leftKey}
        </View>
        <View>{key(<Text variant="title">0</Text>, () => press('0'), '0')}</View>
        <View>
          {key(
            <Ionicons name="backspace-outline" size={26} color={colors.text} />,
            () => setPin(current.current.slice(0, -1)),
            t('security.pad.delete'),
          )}
        </View>
      </View>
    </View>
  );
});
