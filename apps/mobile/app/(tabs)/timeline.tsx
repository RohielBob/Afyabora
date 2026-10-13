// Onglet Historique = chronologie médicale (L2-09, CDC F4) : mesures et événements (repas, activité,
// traitement déclaré) groupés par jour, du plus récent au plus ancien ; filtres tout / glycémie / repas /
// activité / traitements / alertes ; badge de provenance sur chaque mesure. Lu sur le téléphone (sans
// réseau), par fenêtres de 30 jours. L'ajout rapide d'un événement arrive avec L2-10.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SectionList, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Button, Card, InlineAlert, Screen, Skeleton, Text } from '@/components/ui';
import { dayLabel } from '@/features/dashboard';
import {
  FilterChips,
  TimelineRow,
  groupByDay,
  matchesFilter,
  useTimeline,
  type TimelineFilter,
} from '@/features/timeline';
import { enterFromBelow, fadeIn, radii, spacing, useReducedMotion, useTheme } from '@/theme';

export default function TimelineScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const { state, loadMore, reload } = useTimeline();
  const [filter, setFilter] = useState<TimelineFilter>('all');

  const sections = useMemo(() => {
    if (state.status !== 'ready') return [];
    return groupByDay(state.items.filter((i) => matchesFilter(i, filter, state.thresholds))).map(
      (section) => ({ ...section, data: section.items }),
    );
  }, [state, filter]);

  const now = state.status === 'ready' ? state.now : new Date();
  const dayTitle = (day: number) => {
    const label = dayLabel(new Date(day), now);
    if (label !== 'earlier') return t(`dashboard.latest.${label}`);
    const text = new Date(day).toLocaleDateString(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return text.charAt(0).toUpperCase() + text.slice(1);
  };

  const header = (
    <View style={{ gap: spacing.lg, paddingBottom: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="overline" tone="primary">
            {t('timeline.overline')}
          </Text>
          <Text variant="title" accessibilityRole="header">
            {t('timeline.title')}
          </Text>
        </View>
        {/* Ajout rapide d'un événement (L2-10) : le type suit le filtre choisi (Repas → repas…). */}
        <Button
          label={t('timeline.addEvent')}
          variant="secondary"
          size="sm"
          icon={<Ionicons name="add" size={18} color={colors.primaryText} />}
          onPress={() =>
            router.push(
              filter === 'MEAL' || filter === 'ACTIVITY' || filter === 'TREATMENT'
                ? { pathname: '/event/new', params: { type: filter } }
                : '/event/new',
            )
          }
        />
      </View>
      <FilterChips value={filter} onChange={setFilter} />
    </View>
  );

  if (state.status !== 'ready') {
    return (
      <Screen>
        {header}
        {state.status === 'error' ? (
          <InlineAlert
            tone="danger"
            message={t('timeline.error')}
            actionLabel={t('common.retry')}
            onAction={reload}
          />
        ) : (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ gap: spacing.sm }}
          >
            <Skeleton width={120} height={14} />
            <Skeleton height={76} radius={radii.lg} />
            <Skeleton height={76} radius={radii.lg} />
            <Skeleton height={76} radius={radii.lg} />
          </View>
        )}
      </Screen>
    );
  }

  const nothingAtAll = state.items.length === 0;
  const emptyForFilter = (
    <Animated.View entering={enterFromBelow(0, reduced)} style={{ paddingTop: spacing.md }}>
      <Card variant="outlined" animateIn={false} style={{ alignItems: 'center', gap: spacing.md }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceMuted,
          }}
        >
          <Ionicons
            name={nothingAtAll ? 'time-outline' : 'funnel-outline'}
            size={26}
            color={colors.textMuted}
          />
        </View>
        <View style={{ gap: spacing.xs }}>
          <Text variant="heading" align="center">
            {nothingAtAll ? t('timeline.empty.title') : t('timeline.emptyFilter.title')}
          </Text>
          <Text tone="muted" align="center">
            {nothingAtAll
              ? t('timeline.empty.text')
              : t('timeline.emptyFilter.text', {
                  filter: t(`timeline.filter.${filter}`).toLowerCase(),
                  days: state.pages * 30,
                })}
          </Text>
        </View>
        {nothingAtAll ? (
          <View style={{ gap: spacing.sm, alignSelf: 'stretch' }}>
            <Button
              label={t('timeline.empty.action')}
              fullWidth
              icon={<Ionicons name="add" size={20} color={colors.onPrimary} />}
              onPress={() => router.push('/measurement/new')}
            />
            {/* Historique vide : reprendre un carnet ou un autre lecteur (import CSV / Excel, L4-05). */}
            <Button
              label={t('timeline.empty.import')}
              variant="ghost"
              fullWidth
              icon={<Ionicons name="cloud-upload-outline" size={20} color={colors.primaryText} />}
              onPress={() => router.push('/import')}
            />
          </View>
        ) : (
          <Button
            label={t('timeline.filter.all')}
            variant="ghost"
            onPress={() => setFilter('all')}
          />
        )}
      </Card>
    </Animated.View>
  );

  const footer = nothingAtAll ? null : (
    <View style={{ paddingTop: spacing.lg, paddingBottom: spacing.xl, alignItems: 'center' }}>
      {state.exhausted ? (
        <Text variant="caption" tone="muted" align="center">
          {t('timeline.end')}
        </Text>
      ) : (
        <Button
          label={t('timeline.more', { days: 30 })}
          variant="outline"
          loading={state.loadingMore}
          icon={<Ionicons name="chevron-down" size={18} color={colors.text} />}
          onPress={loadMore}
        />
      )}
    </View>
  );

  return (
    <Screen scroll={false}>
      {/* Titre et filtres HORS de la liste : ils restent en place (la pastille choisie reste visible)
          quand la liste est recréée à chaque filtre. */}
      <View style={{ flex: 1 }}>
        {header}
        <SectionList
          // Nouvelle liste à chaque filtre : les lignes réapparaissent en douceur au lieu de « sauter ».
          key={filter}
          style={{ flex: 1 }}
          sections={sections}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          ListEmptyComponent={emptyForFilter}
          ListFooterComponent={footer}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          initialNumToRender={20}
          renderSectionHeader={({ section }) => (
            <Animated.View
              entering={reduced ? undefined : fadeIn(reduced)}
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                paddingTop: spacing.lg,
                paddingBottom: spacing.sm,
              }}
            >
              <Text variant="label" accessibilityRole="header">
                {dayTitle(section.day)}
              </Text>
              <Text variant="caption" tone="muted">
                {t('timeline.count', { count: section.data.length })}
              </Text>
            </Animated.View>
          )}
          renderItem={({ item, index, section }) => {
            const sectionIndex = sections.indexOf(section as (typeof sections)[number]);
            const before = sections
              .slice(0, Math.max(0, sectionIndex))
              .reduce((n, s) => n + s.data.length, 0);
            return (
              <TimelineRow
                item={item}
                unit={state.unit}
                thresholds={state.thresholds}
                first={index === 0}
                last={index === section.data.length - 1}
                index={before + index}
                onPress={
                  item.kind === 'measurement'
                    ? () => router.push({ pathname: '/measurement/[id]', params: { id: item.id } })
                    : undefined
                }
              />
            );
          }}
        />
      </View>
    </Screen>
  );
}
