// Ticket L8-07 : déclencheurs de la synchronisation et détection du réseau.
import type { AppStateStatus } from 'react-native';
import type { NetInfoState } from '@react-native-community/netinfo';
import { isReachable, onBackOnline } from '../connectivity';
import type { SyncState } from '../engine';
import { RESUME_MIN_GAP_MS, refreshNow, shouldSyncOnResume, startSyncTriggers } from '../triggers';

const NOW = Date.parse('2026-10-13T10:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('isReachable (NetInfo)', () => {
  it('connecté et Internet joignable, ou pas encore vérifié ⇒ en ligne', () => {
    expect(isReachable({ isConnected: true, isInternetReachable: true })).toBe(true);
    expect(isReachable({ isConnected: true, isInternetReachable: null })).toBe(true);
  });

  it('pas connecté, ou Wi-Fi sans Internet ⇒ hors-ligne', () => {
    expect(isReachable({ isConnected: false, isInternetReachable: null })).toBe(false);
    expect(isReachable({ isConnected: null, isInternetReachable: null })).toBe(false);
    expect(isReachable({ isConnected: true, isInternetReachable: false })).toBe(false);
  });
});

describe('onBackOnline', () => {
  const state = (online: boolean) =>
    ({ isConnected: online, isInternetReachable: online ? true : false }) as NetInfoState;

  it('appelé à chaque RETOUR du réseau, jamais au premier état ni en restant en ligne', () => {
    let emit: (s: NetInfoState) => void = () => undefined;
    const back = jest.fn();
    const unsubscribe = jest.fn();
    const stop = onBackOnline(back, (listener) => {
      emit = listener;
      return unsubscribe;
    });

    emit(state(true)); // premier état : en ligne
    emit(state(true));
    expect(back).not.toHaveBeenCalled();
    emit(state(false)); // mode avion
    emit(state(false));
    emit(state(true)); // retour
    expect(back).toHaveBeenCalledTimes(1);
    emit(state(true));
    emit(state(false));
    emit(state(true));
    expect(back).toHaveBeenCalledTimes(2);

    stop();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('shouldSyncOnResume', () => {
  it('active après l’arrière-plan, sans synchronisation récente ⇒ oui', () => {
    expect(shouldSyncOnResume(true, 'active', null, NOW)).toBe(true);
    expect(shouldSyncOnResume(true, 'active', ago(RESUME_MIN_GAP_MS), NOW)).toBe(true);
    expect(shouldSyncOnResume(true, 'active', 'illisible', NOW)).toBe(true);
  });

  it('dernière synchronisation de moins de 30 s ⇒ non (changer d’application ne relance pas tout)', () => {
    expect(shouldSyncOnResume(true, 'active', ago(RESUME_MIN_GAP_MS - 1), NOW)).toBe(false);
  });

  it('pas passée par l’arrière-plan (Face ID, centre de contrôle), ou pas encore active ⇒ non', () => {
    expect(shouldSyncOnResume(false, 'active', null, NOW)).toBe(false);
    expect(shouldSyncOnResume(true, 'inactive', null, NOW)).toBe(false);
    expect(shouldSyncOnResume(true, 'background', null, NOW)).toBe(false);
  });
});

describe('startSyncTriggers', () => {
  function setup(lastSuccessAt: string | null = null, initialAppState: AppStateStatus = 'active') {
    let appState: (s: AppStateStatus) => void = () => undefined;
    let backOnline: () => void = () => undefined;
    const stops = { app: jest.fn(), net: jest.fn() };
    const request = jest.fn();
    const stop = startSyncTriggers({
      request,
      lastSuccessAt: () => lastSuccessAt,
      subscribeAppState: (listener) => {
        appState = listener;
        return stops.app;
      },
      subscribeBackOnline: (listener) => {
        backOnline = listener;
        return stops.net;
      },
      initialAppState,
      now: () => NOW,
    });
    return {
      request,
      stop,
      stops,
      appState: (s: AppStateStatus) => appState(s),
      backOnline: () => backOnline(),
    };
  }

  it('ouverture (ou connexion) : synchronisation tout de suite', () => {
    expect(setup().request).toHaveBeenCalledTimes(1);
  });

  it('retour du réseau : synchronisation tout de suite', () => {
    const t = setup();
    t.backOnline();
    expect(t.request).toHaveBeenCalledTimes(2);
  });

  it('retour dans l’application après l’arrière-plan : synchronisation ; « inactive » : rien', () => {
    const t = setup();
    t.appState('inactive');
    t.appState('active');
    expect(t.request).toHaveBeenCalledTimes(1);
    t.appState('background');
    t.appState('active');
    expect(t.request).toHaveBeenCalledTimes(2);
  });

  it('arrière-plan, puis « inactive », puis active : synchronisation quand même', () => {
    const t = setup();
    t.appState('background');
    t.appState('inactive');
    expect(t.request).toHaveBeenCalledTimes(1);
    t.appState('active');
    expect(t.request).toHaveBeenCalledTimes(2);
    t.appState('inactive'); // Face ID : rien de plus
    t.appState('active');
    expect(t.request).toHaveBeenCalledTimes(2);
  });

  it('retour dans l’application juste après une synchronisation réussie : rien', () => {
    const t = setup(ago(5_000));
    t.appState('background');
    t.appState('active');
    expect(t.request).toHaveBeenCalledTimes(1);
  });

  it('application démarrée en arrière-plan : synchronisation quand elle s’affiche', () => {
    const t = setup(ago(5 * 60_000), 'background');
    t.appState('active');
    expect(t.request).toHaveBeenCalledTimes(2);
  });

  it('déconnexion : tout est débranché', () => {
    const t = setup();
    t.stop();
    expect(t.stops.app).toHaveBeenCalled();
    expect(t.stops.net).toHaveBeenCalled();
  });
});

describe('refreshNow (tirer pour rafraîchir)', () => {
  it('indicateur affiché pendant la synchronisation, écran relu ensuite', async () => {
    const steps: string[] = [];
    const result = await refreshNow(
      async () => {
        steps.push('sync');
        return { status: 'idle' } as SyncState;
      },
      () => steps.push('relire'),
      (value) => steps.push(value ? 'indicateur' : 'fin'),
    );
    expect(steps).toEqual(['indicateur', 'sync', 'relire', 'fin']);
    expect(result?.status).toBe('idle');
  });

  it('synchronisation en erreur : l’écran est relu quand même et l’indicateur s’arrête', async () => {
    const steps: string[] = [];
    const result = await refreshNow(
      () => Promise.reject(new Error('base')),
      () => steps.push('relire'),
      (value) => steps.push(value ? 'indicateur' : 'fin'),
    );
    expect(steps).toEqual(['indicateur', 'relire', 'fin']);
    expect(result).toBeNull();
  });
});
