// Indicateur de synchronisation (CDC F3 : « 3 mesures en attente » / « À jour »). Une ligne discrète :
// icône + texte (jamais la couleur seule). L'envoi réel au serveur arrive avec le moteur de synchro (L8).
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text } from '@/components/ui';
import { enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';

export function SyncStatus({ pending, index = 0 }: { pending: number; index?: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const upToDate = pending === 0;

  return (
    <Animated.View entering={enterFromBelow(index, reduced)}>
      <View
        accessible
        accessibilityRole="text"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingVertical: spacing.sm + 2,
          paddingHorizontal: spacing.md,
          borderRadius: radii.md,
          backgroundColor: colors.surfaceMuted,
        }}
      >
        <Ionicons
          name={upToDate ? 'cloud-done-outline' : 'cloud-upload-outline'}
          size={18}
          color={upToDate ? colors.success : colors.textMuted}
        />
        <Text variant="bodySmall" tone="muted" style={{ flexShrink: 1 }}>
          {upToDate ? t('sync.upToDate') : t('sync.pending', { count: pending })}
        </Text>
      </View>
    </Animated.View>
  );
}
