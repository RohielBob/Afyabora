// Réglages → Sécurité : protection des données de santé enregistrées sur ce téléphone (L8-02). Permet de
// vérifier, dans l'application installée, que la base locale est bien chiffrée. L'état est toujours dit par
// une icône ET un libellé (jamais par la couleur seule).
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card, InlineAlert, Text } from '@/components/ui';
import { getDbProtection, type DbProtection } from '@/db/client';
import { radii, spacing, useTheme } from '@/theme';

type Shown = DbProtection['state'] | 'loading' | 'error';

const ICON: Record<Shown, keyof typeof Ionicons.glyphMap> = {
  loading: 'hourglass-outline',
  encrypted: 'lock-closed',
  unencrypted: 'lock-open-outline',
  web: 'globe-outline',
  error: 'alert-circle-outline',
};

export function StorageProtectionCard({ index }: { index: number }) {
  const { t } = useTranslation();
  const { colors, mode } = useTheme();
  const [protection, setProtection] = useState<DbProtection | 'loading' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    getDbProtection().then(
      (value) => alive && setProtection(value),
      () => alive && setProtection('error'),
    );
    return () => {
      alive = false;
    };
  }, []);

  const shown: Shown = typeof protection === 'string' ? protection : protection.state;
  const recovery = typeof protection === 'string' ? 'none' : protection.recovery;
  const color =
    shown === 'encrypted'
      ? colors.success
      : shown === 'loading'
        ? colors.textMuted
        : colors.warning;
  const label = t(`security.settings.storage.${shown}`);

  return (
    <Card variant="outlined" index={index}>
      <Text variant="subheading">{t('security.settings.storage.title')}</Text>
      <View
        accessible
        accessibilityLabel={label}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: radii.sm,
            // Fond très léger de la couleur de l'état (≈ 8 % en clair, 14 % en sombre), comme InlineAlert.
            backgroundColor: `${color}${mode === 'dark' ? '24' : '14'}`,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={ICON[shown]} size={18} color={color} />
        </View>
        <Text variant="bodyStrong">{label}</Text>
      </View>
      {shown === 'loading' ? null : (
        <Text variant="bodySmall" tone="muted">
          {t(`security.settings.storage.${shown}Hint`)}
        </Text>
      )}
      {recovery !== 'none' ? (
        <InlineAlert
          tone={recovery === 'migrated' ? 'success' : 'warning'}
          message={t(`security.settings.storage.${recovery}`)}
        />
      ) : null}
    </Card>
  );
}
