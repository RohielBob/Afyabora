// Ligne de bas de formulaire : « Déjà un compte ? Se connecter ».
import { View } from 'react-native';
import { Text } from '@/components/ui';
import { spacing } from '@/theme';

export function FooterLink({
  question,
  action,
  onPress,
}: {
  question: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: spacing.xs,
        paddingVertical: spacing.sm,
      }}
    >
      <Text variant="bodySmall" tone="muted">
        {question}
      </Text>
      <Text
        variant="label"
        tone="primary"
        accessibilityRole="link"
        onPress={onPress}
        suppressHighlighting
      >
        {action}
      </Text>
    </View>
  );
}
