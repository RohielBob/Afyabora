// Onglet Profil (provisoire : le profil médical complet arrive avec l'assistant L1-08).
// L1-07 : déconnexion avec confirmation dans la page ; si des mesures ne sont pas encore envoyées au
// serveur, la personne est prévenue qu'elles seront effacées de ce téléphone (ADR-0004).
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Button, Card, InlineAlert, ListRow, Screen, Text } from '@/components/ui';
import { countUnsyncedChanges } from '@/db/reset';
import { signOut } from '@/features/auth';
import { enterFromBelow, spacing, useReducedMotion, useTheme } from '@/theme';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [confirming, setConfirming] = useState(false);
  const [unsynced, setUnsynced] = useState(0);
  const [leaving, setLeaving] = useState(false);

  const askSignOut = async () => {
    setUnsynced(await countUnsyncedChanges());
    setConfirming(true);
  };

  const confirmSignOut = async () => {
    setLeaving(true);
    await signOut(); // la session passe à « déconnecté » : la navigation revient à l'accueil
  };

  return (
    <Screen>
      <Text variant="title">{t('profile.title')}</Text>

      <Card variant="outlined" index={0}>
        <Text variant="overline" tone="primary">
          {t('profile.todoTitle')}
        </Text>
        <Text tone="muted">{t('profile.todoText')}</Text>
      </Card>

      <Card variant="outlined" index={1} style={{ padding: 6, gap: 0 }}>
        <ListRow
          icon={<Ionicons name="settings-outline" size={20} color={colors.primaryText} />}
          title={t('profile.settings')}
          subtitle={t('profile.settingsHint')}
          onPress={() => router.push('/settings')}
        />
        <ListRow
          icon={<Ionicons name="sync-outline" size={20} color={colors.primaryText} />}
          title={t('profile.sync')}
          subtitle={t('profile.syncHint')}
          onPress={() => router.push('/sync')}
        />
        <ListRow
          icon={<Ionicons name="cloud-upload-outline" size={20} color={colors.primaryText} />}
          title={t('profile.import')}
          subtitle={t('profile.importHint')}
          onPress={() => router.push('/import')}
        />
      </Card>

      {confirming ? (
        <Animated.View entering={enterFromBelow(0, reduced)} style={{ gap: spacing.md }}>
          <InlineAlert
            tone={unsynced > 0 ? 'warning' : 'info'}
            title={t('profile.signOutConfirmTitle')}
            message={
              unsynced > 0
                ? t('profile.signOutUnsynced', { count: unsynced })
                : t('profile.signOutConfirmText')
            }
          />
          <View style={{ gap: spacing.sm }}>
            <Button
              label={t('profile.signOut')}
              variant="danger"
              loading={leaving}
              onPress={confirmSignOut}
            />
            <Button
              label={t('common.cancel')}
              variant="ghost"
              disabled={leaving}
              onPress={() => setConfirming(false)}
            />
          </View>
        </Animated.View>
      ) : (
        <Button
          label={t('profile.signOut')}
          variant="outline"
          icon={<Ionicons name="log-out-outline" size={20} color={colors.text} />}
          onPress={askSignOut}
        />
      )}
    </Screen>
  );
}
