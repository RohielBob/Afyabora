// Règles du mot de passe affichées pendant la saisie : chaque règle se coche (vert) dès qu'elle est remplie.
// Couleur + icône + texte : jamais la couleur seule.
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { Text } from '@/components/ui';
import { durations, spacing, useReducedMotion, useTheme } from '@/theme';
import { PASSWORD_MIN_LENGTH, passwordChecks } from '../validation';

export function PasswordChecklist({ password }: { password: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();

  return (
    <View style={{ gap: spacing.xs }} accessibilityLabel={t('auth.password.rulesTitle')}>
      {passwordChecks(password).map((rule) => (
        <View
          key={rule.key}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
        >
          <Animated.View
            key={String(rule.ok)} // rejoue l'apparition quand la règle change d'état
            entering={reduced ? undefined : ZoomIn.duration(durations.fast)}
          >
            <Ionicons
              name={rule.ok ? 'checkmark-circle' : 'ellipse-outline'}
              size={16}
              color={rule.ok ? colors.success : colors.textSubtle}
            />
          </Animated.View>
          <Text
            variant="caption"
            tone={rule.ok ? 'success' : 'muted'}
            accessibilityLabel={`${t(rule.key, { count: PASSWORD_MIN_LENGTH })} : ${
              rule.ok ? t('auth.password.ruleOk') : t('auth.password.ruleTodo')
            }`}
          >
            {t(rule.key, { count: PASSWORD_MIN_LENGTH })}
          </Text>
        </View>
      ))}
    </View>
  );
}
