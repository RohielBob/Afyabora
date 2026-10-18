// Une visite du journal d'accès (L5-09) : qui, quand, combien de temps, et comment l'accès a pris fin. La
// fin est dite par une icône ET un libellé (« Arrivé à son terme », « Arrêté par vous », « En cours »),
// jamais par la couleur seule.
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { whenLabel } from '@/features/sync';
import { radii, spacing, useTheme } from '@/theme';
import { formatMinutes, visitMinutes, type Visit } from '../log';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function VisitCard({ visit, index, now }: { visit: Visit; index: number; now: Date }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();

  const when = (iso: string) => {
    const label = whenLabel(iso, now, i18n.language);
    return label.sameDay
      ? t('share.log.today', { time: label.time })
      : t('share.log.onDate', { date: label.date, time: label.time });
  };

  if (visit.kind === 'emergency') {
    return (
      <Card variant="outlined" index={index} style={{ gap: spacing.xs }}>
        <Row icon="medkit-outline" title={t('share.log.emergency.title')} />
        <Text variant="bodySmall" tone="muted">
          {when(visit.at)}
        </Text>
        <Text variant="caption" tone="muted">
          {t('share.log.emergency.text')}
        </Text>
      </Card>
    );
  }

  const minutes = visitMinutes(visit);
  const status: { icon: IconName; label: string } =
    visit.end === 'expired'
      ? { icon: 'time-outline', label: t('share.log.end.expired') }
      : visit.end === 'revoked'
        ? { icon: 'stop-circle-outline', label: t('share.log.end.revoked') }
        : { icon: 'eye-outline', label: t('share.log.end.ongoing') };
  const details = [
    visit.views > 0 ? t('share.log.views', { count: visit.views }) : null,
    visit.reportDownloads > 0 ? t('share.log.report') : null,
  ].filter((d): d is string => d !== null);

  return (
    <Card variant="outlined" index={index} style={{ gap: spacing.sm }}>
      <Row
        icon="person-circle-outline"
        title={
          visit.doctorName
            ? t('share.log.doctor', { name: visit.doctorName })
            : t('share.log.unknownDoctor')
        }
      />
      <Text variant="bodySmall" tone="muted">
        {when(visit.startedAt)}
        {minutes !== null
          ? ` · ${t('share.log.lasted', { duration: formatMinutes(minutes) })}`
          : ''}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            paddingHorizontal: spacing.sm,
            paddingVertical: 4,
            borderRadius: radii.pill,
            backgroundColor: visit.end ? colors.surfaceMuted : colors.primarySoft,
          }}
        >
          <Ionicons
            name={status.icon}
            size={14}
            color={visit.end ? colors.textMuted : colors.primaryText}
          />
          <Text variant="caption" tone={visit.end ? 'muted' : 'primary'}>
            {status.label}
          </Text>
        </View>
      </View>
      {details.length > 0 ? (
        <Text variant="caption" tone="muted">
          {details.join(' · ')}
        </Text>
      ) : null}
    </Card>
  );
}

function Row({ icon, title }: { icon: IconName; title: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Ionicons name={icon} size={22} color={colors.primaryText} />
      <Text variant="bodyStrong" style={{ flex: 1 }}>
        {title}
      </Text>
    </View>
  );
}
