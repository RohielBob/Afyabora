import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Card, ListRow, Screen, Text } from '@/components/ui';
import { useTheme } from '@/theme';

// Écran provisoire : le profil médical complet (assistant, édition) arrive avec les écrans mobiles du lot L1.
export default function ProfileScreen() {
  const { colors } = useTheme();
  return (
    <Screen>
      <Text variant="title">Profil</Text>
      <Card variant="outlined" index={0}>
        <Text variant="overline" tone="primary">
          À réaliser : écrans du profil (lot L1)
        </Text>
        <Text tone="muted">Profil médical, seuils, contact d'urgence, déconnexion.</Text>
      </Card>
      <Card variant="outlined" index={1} style={{ padding: 6, gap: 0 }}>
        <ListRow
          icon={<Ionicons name="settings-outline" size={20} color={colors.primaryText} />}
          title="Paramètres"
          subtitle="Apparence, unités, notifications, sécurité"
          onPress={() => router.push('/settings')}
        />
      </Card>
    </Screen>
  );
}
