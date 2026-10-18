// Code de secours (L5-10) : le même jeton que le QR, en texte, pour un médecin sans caméra. Caché par
// défaut (« Afficher le code de secours »), il suit la rotation du QR (même jeton, même durée de vie, même
// usage unique) et est montré par groupes de 4 caractères pour être recopié sans erreur ; le portail
// ignore les espaces. Masqué dès que le QR n'est plus valable, comme le QR.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, Text } from '@/components/ui';
import { radii, spacing, useTheme } from '@/theme';

/** « k3Zt9Qw2Vx… » ⇒ « k3Zt 9Qw2 Vx… » (groupes de `size` caractères). */
export function groupCode(token: string, size = 4): string {
  return token.match(new RegExp(`.{1,${size}}`, 'g'))?.join(' ') ?? '';
}

export function BackupCode({ token, alive }: { token: string; alive: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [shown, setShown] = useState(false);

  if (!shown) {
    return (
      <Button
        label={t('share.qr.backup.show')}
        variant="ghost"
        size="sm"
        onPress={() => setShown(true)}
      />
    );
  }
  return (
    <View
      style={{
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceMuted,
      }}
    >
      <Text variant="caption" tone="muted">
        {t('share.qr.backup.label')}
      </Text>
      {alive ? (
        <Text
          variant="bodyStrong"
          selectable
          accessibilityLabel={t('share.qr.backup.a11y')}
          style={{ letterSpacing: 1 }}
        >
          {groupCode(token)}
        </Text>
      ) : (
        <Text tone="muted">{t('share.qr.expired')}</Text>
      )}
      <Text variant="caption" tone="muted">
        {t('share.qr.backup.hint')}
      </Text>
      <Button
        label={t('share.qr.backup.hide')}
        variant="ghost"
        size="sm"
        onPress={() => setShown(false)}
      />
    </View>
  );
}
