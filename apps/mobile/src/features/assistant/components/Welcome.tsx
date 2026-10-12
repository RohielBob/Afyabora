// Conversation vide (L9-09) : Afyabora se présente (ce qu'il sait faire, et ce qu'il ne fera jamais), puis
// propose 4 questions, une par source de réponse (mesures de la semaine, du soir, une fiche, une conduite à
// tenir). Un appui pose la question.
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { LogoMark } from '@/components/brand';
import { PressableScale, Text } from '@/components/ui';
import { enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';
import { SUGGESTIONS } from '../presentation';

export function Welcome({
  onAsk,
  disabled,
}: {
  onAsk: (question: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const { colors, mode } = useTheme();
  const reduced = useReducedMotion();
  return (
    <View style={{ gap: spacing.lg }}>
      <Animated.View
        entering={enterFromBelow(0, reduced)}
        style={{
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.lg,
        }}
      >
        <LogoMark size={56} />
        <Text variant="heading" align="center" accessibilityRole="header">
          {t('assistant.welcome.title')}
        </Text>
        <Text variant="body" tone="muted" align="center">
          {t('assistant.welcome.body')}
        </Text>
      </Animated.View>

      <Animated.View
        entering={enterFromBelow(1, reduced)}
        style={{
          borderRadius: radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: mode === 'dark' ? colors.surfaceRaised : colors.surface,
          padding: spacing.lg,
          gap: spacing.sm,
        }}
      >
        {(['measures', 'sheets', 'never'] as const).map((key) => (
          <View key={key} style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Ionicons
              name={
                key === 'measures'
                  ? 'analytics-outline'
                  : key === 'sheets'
                    ? 'document-text-outline'
                    : 'shield-checkmark-outline'
              }
              size={18}
              color={colors.primaryText}
              style={{ marginTop: 2 }}
            />
            <Text variant="bodySmall" style={{ flex: 1 }}>
              {t(`assistant.welcome.${key}`)}
            </Text>
          </View>
        ))}
      </Animated.View>

      <View style={{ gap: spacing.sm }}>
        <Text variant="overline" tone="muted">
          {t('assistant.welcome.try')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {SUGGESTIONS.map((key, i) => {
            const question = t(`assistant.suggestions.${key}`);
            return (
              <Animated.View key={key} entering={enterFromBelow(i + 2, reduced)}>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={question}
                  accessibilityHint={t('assistant.welcome.suggestionHint')}
                  accessibilityState={{ disabled }}
                  disabled={disabled}
                  onPress={() => onAsk(question)}
                  style={{
                    borderRadius: radii.pill,
                    borderWidth: 1,
                    borderColor: colors.primarySoftBorder,
                    backgroundColor: colors.primarySoft,
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.sm,
                    opacity: disabled ? 0.5 : 1,
                  }}
                >
                  <Text variant="label" tone="primary">
                    {question}
                  </Text>
                </PressableScale>
              </Animated.View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
