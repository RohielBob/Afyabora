// Branche la logique de la carte d'urgence (card.ts) sur le vrai téléphone : API, jeton gardé en stockage
// chiffré, export de l'image. Relue à chaque retour sur l'écran (ex. après la modification de la carte).
//  - Activer une carte sans QR sur ce téléphone en génère un (choix de l'équipe : l'écran enchaîne les deux).
//  - Sans réseau : on le dit ; le QR déjà gardé sur le téléphone reste affiché (il marche toujours).
import type { EmergencyCardInput, EmergencyCardResponse } from '@glyka/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { emergencyApi } from './api';
import { cardProblem, qrStatus, shouldGenerateQr, type CardProblem, type QrStatus } from './card';
import { readStoredQr, storeQr } from './qr-storage';

export type EmergencyState =
  | { status: 'loading' }
  | { status: 'failed'; problem: CardProblem; qr: QrStatus | null }
  | { status: 'ready'; card: EmergencyCardResponse; qr: QrStatus };

export type EmergencyAction = 'enable' | 'disable' | 'regenerate';

export function useEmergencyCard(userId: string) {
  const [state, setState] = useState<EmergencyState>({ status: 'loading' });
  const [busy, setBusy] = useState<EmergencyAction | null>(null);
  const [actionProblem, setActionProblem] = useState<CardProblem | null>(null);
  const lastLoad = useRef(0);

  const load = useCallback(async () => {
    const id = ++lastLoad.current;
    const stored = await readStoredQr(userId).catch(() => null);
    try {
      const card = await emergencyApi.get();
      if (id === lastLoad.current) setState({ status: 'ready', card, qr: qrStatus(card, stored) });
    } catch (error) {
      if (id !== lastLoad.current) return;
      // Hors-ligne : le QR gardé sur le téléphone peut encore être montré.
      const qr: QrStatus | null = stored ? { kind: 'ready', ...stored } : null;
      setState({ status: 'failed', problem: cardProblem(error), qr });
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        lastLoad.current += 1;
      };
    }, [load]),
  );

  /** Nouveau QR : gardé sur le téléphone ; l'ancien (imprimé ou non) ne marche plus. */
  const newQr = async (): Promise<QrStatus> => {
    const qr = await emergencyApi.regenerate();
    await storeQr(userId, qr);
    return { kind: 'ready', token: qr.token, url: qr.url };
  };

  const run = async (action: EmergencyAction, task: () => Promise<void>) => {
    setBusy(action);
    setActionProblem(null);
    try {
      await task();
    } catch (error) {
      setActionProblem(cardProblem(error));
      void load(); // état réel relu (ex. carte activée mais QR pas encore généré)
    } finally {
      setBusy(null);
    }
  };

  /** Activer / désactiver. Activer sans QR affichable ici ⇒ un QR est généré dans la foulée. */
  const setEnabled = (enabled: boolean) =>
    run(enabled ? 'enable' : 'disable', async () => {
      if (state.status !== 'ready') return;
      const card = await emergencyApi.save({ ...inputOf(state.card), enabled });
      const qr = shouldGenerateQr(enabled, state.qr)
        ? await newQr()
        : qrStatus(card, readyOf(state.qr));
      setState({
        status: 'ready',
        card: { ...card, qrActive: card.qrActive || qr.kind === 'ready' },
        qr,
      });
    });

  const regenerate = () =>
    run('regenerate', async () => {
      if (state.status !== 'ready') return;
      const qr = await newQr();
      setState({ status: 'ready', card: { ...state.card, qrActive: true }, qr });
    });

  return { state, busy, actionProblem, reload: load, setEnabled, regenerate };
}

/** La carte telle qu'enregistrée ⇒ corps de PUT (pour ne changer que l'état « activée »). */
export function inputOf(card: EmergencyCardResponse): EmergencyCardInput {
  const { updatedAt: _updatedAt, qrActive: _qrActive, ...input } = card;
  return input;
}

function readyOf(qr: QrStatus): { token: string; url: string } | null {
  return qr.kind === 'ready' ? { token: qr.token, url: qr.url } : null;
}
