// Champ de saisie : libellé au-dessus (toujours visible), bordure qui s'anime au focus et en erreur,
// message d'aide ou d'erreur qui apparaît en fondu, bouton « Afficher » pour les mots de passe.
import { forwardRef, useEffect, useState } from 'react';
import { Platform, Pressable, TextInput, View, type TextInputProps } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { durations, easing, fadeIn, radii, spacing, touchTarget, useTheme } from '@/theme';
import { Text, textStyle } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Message sous le champ (aide). Remplacé par `error` s'il y en a une. */
  hint?: string;
  error?: string;
  /** Mot de passe : texte masqué + bouton « Afficher / Masquer ». */
  secret?: boolean;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hint, error, secret, onFocus, onBlur, editable = true, ...rest },
  ref,
) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  // 0 = repos, 1 = focus ; l'erreur l'emporte (couleur danger).
  const focus = useSharedValue(0);
  const hasError = useSharedValue(error ? 1 : 0);

  useEffect(() => {
    hasError.value = withTiming(error ? 1 : 0, { duration: durations.fast });
  }, [error, hasError]);

  const borderStyle = useAnimatedStyle(() => {
    const base = interpolateColor(focus.value, [0, 1], [colors.borderStrong, colors.focus]);
    return {
      borderColor: interpolateColor(hasError.value, [0, 1], [base as string, colors.danger]),
      borderWidth: 1 + focus.value * 0.5,
    };
  });

  const message = error ?? hint;

  return (
    <View style={{ gap: spacing.xs + 2, opacity: editable ? 1 : 0.55 }}>
      <Text variant="label">{label}</Text>
      <Animated.View
        style={[
          {
            minHeight: touchTarget + 4,
            borderRadius: radii.md,
            backgroundColor: colors.surface,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: spacing.lg,
          },
          borderStyle,
        ]}
      >
        <TextInput
          ref={ref}
          {...rest}
          editable={editable}
          secureTextEntry={secret && !visible}
          accessibilityLabel={label}
          accessibilityHint={message}
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.focus}
          onFocus={(e) => {
            focus.value = withTiming(1, { duration: durations.fast, easing: easing.standard });
            onFocus?.(e);
          }}
          onBlur={(e) => {
            focus.value = withTiming(0, { duration: durations.fast, easing: easing.standard });
            onBlur?.(e);
          }}
          style={[
            textStyle('body'),
            { flex: 1, color: colors.text, paddingVertical: spacing.md },
            // Web : retire le cadre ajouté par le navigateur (la bordure animée du champ suffit).
            Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
          ]}
        />
        {secret ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            hitSlop={12}
            onPress={() => setVisible((v) => !v)}
          >
            <Text variant="label" tone="primary">
              {visible ? 'Masquer' : 'Afficher'}
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>
      {message ? (
        <Animated.View key={error ? 'error' : 'hint'} entering={fadeIn()}>
          <Text
            variant="caption"
            tone={error ? 'danger' : 'muted'}
            accessibilityLiveRegion={error ? 'polite' : 'none'}
          >
            {error ? `⚠ ${error}` : hint}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
});
