// « Tirer pour rafraîchir » aux couleurs du thème (L8-07) : l'indicateur qui tourne en haut d'une liste
// tirée vers le bas. À passer à `refreshControl` d'une liste avec pullToRefresh(), ou via la propriété
// `refresh` de <Screen>.
//
// IMPORTANT (bug vu sur un vrai téléphone Android, 2026-10-20) : sur Android, React Native ne place pas
// l'indicateur DANS la liste, il place la liste DANS l'indicateur. Il recopie notre élément en lui donnant
// la liste en `children` et sa taille en `style`. Ce composant doit donc TRANSMETTRE ces propriétés à
// <RefreshControl> ; avant, il les ignorait, et l'écran entier (Accueil, Historique, Synchronisation,
// journal d'accès) s'affichait VIDE sur Android. Sur iPhone, l'indicateur est passé autrement (pas de
// recopie), d'où un bug invisible ailleurs. Test : src/components/ui/__tests__/pull-to-refresh.test.tsx.
//
// Sur le web (aperçu de développement), le geste n'existe pas : pullToRefresh() ne renvoie rien.
import type { ReactElement, ReactNode } from 'react';
import {
  Platform,
  RefreshControl,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';

export interface RefreshProps {
  refreshing: boolean;
  onRefresh: () => void;
}

/** Propriétés ajoutées par React Native sur Android quand il recopie l'indicateur (voir plus haut). */
interface InjectedProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function PullToRefresh({
  refreshing,
  onRefresh,
  children,
  style,
}: RefreshProps & InjectedProps) {
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
      style={style}
    >
      {children}
    </RefreshControl>
  );
}

/** Valeur de `refreshControl` d'une liste : l'indicateur sur téléphone, rien sur le web. */
export function pullToRefresh(
  refresh: RefreshProps | undefined,
): ReactElement<RefreshControlProps> | undefined {
  if (!refresh || Platform.OS === 'web') return undefined;
  return <PullToRefresh {...refresh} />;
}
