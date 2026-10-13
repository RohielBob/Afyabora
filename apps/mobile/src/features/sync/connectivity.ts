// Détection du réseau (ticket L8-07) avec NetInfo. Utilisée par les déclencheurs de synchronisation
// (triggers.ts) et par le moteur (pas d'essai inutile en mode avion), et par l'analyse (L3-09).
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

/**
 * Réseau utilisable : connecté, et Internet pas déclaré injoignable. `isInternetReachable` vaut `null` tant
 * que le téléphone ne l'a pas encore vérifié : on considère alors qu'on est en ligne (au pire, la requête
 * échoue et le moteur réessaie).
 */
export function isReachable(
  state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>,
): boolean {
  return Boolean(state.isConnected && state.isInternetReachable !== false);
}

export async function isOnline(): Promise<boolean> {
  return isReachable(await NetInfo.fetch());
}

/**
 * Appelle `onBackOnline` à chaque RETOUR du réseau (hors-ligne ⇒ en ligne), jamais au premier état reçu ni
 * quand on reste en ligne. Retourne la fonction de désabonnement.
 */
export function onBackOnline(
  onBackOnline: () => void,
  subscribe: (listener: (state: NetInfoState) => void) => () => void = NetInfo.addEventListener,
): () => void {
  let wasOffline = false;
  return subscribe((state) => {
    const online = isReachable(state);
    if (online && wasOffline) onBackOnline();
    wasOffline = !online;
  });
}
