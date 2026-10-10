// En-tête commun des écrans d'authentification : bouton retour, pictogramme ou logo, titre et sous-titre.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { LogoMark } from '@/components/brand';
import { Text } from '@/components/ui';
import { enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';

export function AuthHeader({
  title,
  subtitle,
  icon,
  showBack = true,
}: {
  title: string;
  subtitle?: string;
  /** Pictogramme dans un cercle teinté ; sans pictogramme, le logo Afyabora est affiché. */
  icon?: keyof typeof Ionicons.glyphMap;
  showBack?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/welcome');
  };

  return (
    <View style={{ gap: spacing.lg }}>
      {showBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={goBack}
          hitSlop={10}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            paddingVertical: spacing.xs,
            paddingRight: spacing.sm,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="chevron-back" size={22} color={colors.primaryText} />
          <Text variant="label" tone="primary">
            {t('common.back')}
          </Text>
        </Pressable>
      ) : null}

      <Animated.View entering={enterFromBelow(0, reduced)} style={{ gap: spacing.md }}>
        {icon ? (
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: radii.xl,
              backgroundColor: colors.primarySoft,
              borderWidth: 1,
              borderColor: colors.primarySoftBorder,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name={icon} size={30} color={colors.primaryText} />
          </View>
        ) : (
          <LogoMark size={56} />
        )}
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text tone="muted">{subtitle}</Text> : null}
      </Animated.View>
    </View>
  );
}
