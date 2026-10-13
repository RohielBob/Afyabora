// « Tirer pour rafraîchir » aux couleurs du thème (L8-07) : l'indicateur qui tourne en haut d'une liste
// tirée vers le bas. À passer à `refreshControl` d'une liste avec pullToRefresh(), ou via la propriété
// `refresh` de <Screen>.
// Sur le web (aperçu de développement), le geste n'existe pas, et React Native Web enveloppe alors la liste
// dans un conteneur sans hauteur : l'écran s'affichait VIDE. pullToRefresh() ne renvoie donc rien sur le web.
import type { ReactElement } from 'react';
import { Platform, RefreshControl, type RefreshControlProps } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';

export interface RefreshProps {
  refreshing: boolean;
  onRefresh: () => void;
}

export function PullToRefresh({ refreshing, onRefresh }: RefreshProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.primary} // iOS
      colors={[colors.primary]} // Android
      progressBackgroundColor={colors.surface} // Android : pastille lisible en clair comme en sombre
      title={refreshing ? t('sync.refreshing') : undefined}
      titleColor={colors.textMuted}
      accessibilityLabel={t('sync.pullToRefresh')}
    />
  );
}

/** Valeur de `refreshControl` d'une liste : l'indicateur sur téléphone, rien sur le web. */
export function pullToRefresh(
  refresh: RefreshProps | undefined,
): ReactElement<RefreshControlProps> | undefined {
  if (!refresh || Platform.OS === 'web') return undefined;
  return <PullToRefresh {...refresh} />;
}
