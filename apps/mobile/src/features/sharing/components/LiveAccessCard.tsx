// Accès en cours (L5-08, CDC F7 étape 5) : « Dr X consulte votre dossier — expire dans 04:37 », l'heure de
// fin, et « Mettre fin à l'accès », confirmé par une seconde touche (un appui par erreur ne coupe rien ;
// une fois confirmé, la coupure est immédiate côté serveur). Le minuteur suit les secondes données par le
// serveur (watch.ts) ; il est lu au lecteur d'écran en minutes et secondes, pas chiffre par chiffre.
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { DoctorIdentity } from '@glyka/shared';
import { Button, Card, InlineAlert, Text } from '@/components/ui';
import { spacing, useTheme } from '@/theme';
import { formatRemaining } from '../watch';

export function LiveAccessCard({
  doctor,
  seconds,
  until,
  ending,
  endFailed,
  offline,
  onEnd,
}: {
  doctor: DoctorIdentity | null;
  /** Secondes d'accès restantes. */
  seconds: number;
  /** Heure de fin (« 17:30 »), si connue. */
  until: string | null;
  ending: boolean;
  endFailed: boolean;
  /** Dernière vérification impossible : le minuteur continue, l'état sera revu au retour du réseau. */
  offline: boolean;
  onEnd: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const name = doctor ? `${doctor.firstName} ${doctor.lastName}` : null;
  const minutes = Math.floor(seconds / 60);

  return (
    <Card variant="tinted" index={0} style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
        <Ionicons name="eye" size={22} color={colors.primaryText} style={{ marginTop: 1 }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">
            {name ? t('share.qr.scanned.byDoctor', { name }) : t('share.qr.scanned.title')}
          </Text>
          {doctor?.institution ? (
            <Text variant="caption" tone="muted">
              {doctor.institution}
            </Text>
          ) : null}
        </View>
      </View>

      <View
        accessible
        accessibilityLabel={t('share.live.remainingA11y', { minutes, seconds: seconds % 60 })}
        style={{ alignItems: 'center', gap: 2, paddingVertical: spacing.sm }}
      >
        <Text variant="caption" tone="muted">
          {t('share.live.expiresIn')}
        </Text>
        <Text variant="metric">{formatRemaining(seconds)}</Text>
        {until ? (
          <Text variant="caption" tone="muted">
            {t('share.qr.scanned.until', { time: until })}
          </Text>
        ) : null}
      </View>

      {offline ? <InlineAlert tone="warning" message={t('share.live.offline')} /> : null}
      {endFailed ? <InlineAlert tone="danger" message={t('share.qr.scanned.endFailed')} /> : null}

      {confirming ? (
        <View style={{ gap: spacing.sm }}>
          <Text variant="bodySmall">
            {name ? t('share.live.confirm', { name }) : t('share.live.confirmNoName')}
          </Text>
          <Button
            label={t('share.live.confirmYes')}
            variant="danger"
            loading={ending}
            onPress={onEnd}
          />
          <Button
            label={t('share.live.confirmNo')}
            variant="ghost"
            disabled={ending}
            onPress={() => setConfirming(false)}
          />
        </View>
      ) : (
        <Button
          label={t('share.qr.scanned.end')}
          variant="danger"
          icon={<Ionicons name="stop-circle-outline" size={20} color={colors.danger} />}
          onPress={() => setConfirming(true)}
        />
      )}
    </Card>
  );
}
