import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Card, ListRow, Screen, Text } from '@/components/ui';
import { ACCENT_LABELS, useAppearance, useTheme } from '@/theme';

const MODE_LABEL = { light: 'Clair', dark: 'Sombre', system: 'Automatique' } as const;

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { preference, accent } = useAppearance();
  const ico = (name: keyof typeof Ionicons.glyphMap) => (
    <Ionicons name={name} size={20} color={colors.primaryText} />
  );

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Text variant="overline" tone="primary">
          Réglages
        </Text>
        <Text variant="title">Paramètres</Text>
      </View>

      <Card variant="outlined" index={0} style={{ padding: 6, gap: 0 }}>
        <ListRow
          icon={ico('color-palette-outline')}
          title="Apparence"
          subtitle="Thème clair ou sombre, couleur d'accent"
          value={`${MODE_LABEL[preference]} · ${ACCENT_LABELS[accent]}`}
          onPress={() => router.push('/settings/appearance')}
        />
        <ListRow
          icon={ico('speedometer-outline')}
          title="Unités et seuils"
          subtitle="Unité préférée, plage cible, seuils d'alerte"
          onPress={() => router.push('/settings/units-thresholds')}
        />
        <ListRow
          icon={ico('notifications-outline')}
          title="Notifications"
          subtitle="Rappels, alertes, heures calmes"
          onPress={() => router.push('/settings/notifications')}
        />
        <ListRow
          icon={ico('lock-closed-outline')}
          title="Sécurité"
          subtitle="Déverrouillage biométrique ou code"
          onPress={() => router.push('/settings/security')}
        />
        <ListRow
          icon={ico('information-circle-outline')}
          title="À propos"
          onPress={() => router.push('/settings/about')}
        />
      </Card>

      {__DEV__ ? (
        <Card variant="tinted" index={1} style={{ padding: 6, gap: 0 }}>
          <ListRow
            icon={ico('brush-outline')}
            title="Planche de style"
            subtitle="Visible en développement : couleurs, textes, composants"
            onPress={() => router.push('/settings/design')}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
