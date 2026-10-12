// Carte d'accès à l'assistant (L9-09), sous l'analyse : « Une question sur vos mesures ? Demandez à
// Afyabora ». Ouvre une nouvelle conversation.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { LogoMark } from '@/components/brand';
import { Card, Text } from '@/components/ui';
import { spacing, useTheme } from '@/theme';

export function AssistantEntryCard({ index = 0 }: { index?: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card
      variant="tinted"
      index={index}
      onPress={() => router.push('/assistant/chat')}
      accessibilityLabel={`${t('assistant.entry.title')}. ${t('assistant.entry.body')}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <LogoMark size={40} />
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text variant="subheading">{t('assistant.entry.title')}</Text>
          <Text variant="bodySmall" tone="muted">
            {t('assistant.entry.body')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.primaryText} />
      </View>
    </Card>
  );
}
