// « Mon profil médical » (onglet Profil) : lit le profil enregistré sur le compte (GET /me/profile).
//  - relu à chaque retour sur l'onglet : après « Modifier », le profil affiché est déjà le nouveau ;
//  - le profil est gardé sur le serveur, pas sur le téléphone (données d'identité et de contact) : sans
//    réseau, l'onglet le dit et propose de réessayer ; les seuils, eux, restent sur le téléphone pour la
//    saisie hors-ligne (local-thresholds.ts), comme avant.
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { wakeServer } from '@/lib/server-wake';
import { profileApi, type PatientProfileResponse } from './api';
import { saveThresholds } from './local-thresholds';
import { unitsProblem, type UnitsProblem } from './settings';

export type MedicalProfileState =
  | { status: 'loading' }
  | { status: 'failed'; problem: Exclude<UnitsProblem, 'invalid' | 'profile'> }
  | { status: 'ready'; profile: PatientProfileResponse };

/** Problème de lecture : pas de réseau, profil pas encore rempli, ou autre erreur. */
export function loadProblem(error: unknown): Exclude<UnitsProblem, 'invalid' | 'profile'> {
  const problem = unitsProblem(error);
  return problem === 'offline' || problem === 'noProfile' ? problem : 'error';
}

/**
 * Lit le profil. Le serveur hébergé peut dormir : la première lecture abandonne alors au bout de 15 s (« pas
 * de connexion »). Dans ce cas, on attend son réveil (jusqu'à 90 s) puis on réessaie UNE fois. Vraiment hors
 * ligne, le réveil échoue vite et l'erreur est rendue telle quelle.
 */
export async function fetchProfile(wake: () => Promise<boolean> = wakeServer) {
  try {
    return await profileApi.get();
  } catch (error) {
    if (loadProblem(error) !== 'offline' || !(await wake())) throw error;
    return profileApi.get();
  }
}

export function useMedicalProfile() {
  const [state, setState] = useState<MedicalProfileState>({ status: 'loading' });
  const loaded = useRef(false);

  const load = useCallback(async () => {
    // Au retour sur l'onglet, le profil déjà affiché reste visible pendant la relecture (pas de clignotement).
    if (!loaded.current) setState({ status: 'loading' });
    try {
      const profile = await fetchProfile();
      await saveThresholds(profile.thresholds);
      loaded.current = true;
      setState({ status: 'ready', profile });
    } catch (error) {
      if (!loaded.current) setState({ status: 'failed', problem: loadProblem(error) });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const retry = useCallback(() => {
    loaded.current = false;
    void load();
  }, [load]);

  return { state, retry };
}
