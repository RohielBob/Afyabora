// Détection du réseau (ticket L8-07). SQUELETTE.
import NetInfo from '@react-native-community/netinfo';

export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return Boolean(state.isConnected && state.isInternetReachable !== false);
}

/** Appelle `onBackOnline` à chaque retour du réseau. Retourne la fonction de désabonnement. */
export function onBackOnline(onBackOnline: () => void): () => void {
  let wasOffline = false;
  return NetInfo.addEventListener((state) => {
    const online = Boolean(state.isConnected && state.isInternetReachable !== false);
    if (online && wasOffline) onBackOnline();
    wasOffline = !online;
  });
}
