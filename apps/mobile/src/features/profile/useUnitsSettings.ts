// Réglages → Unités et seuils (L1-05) : branche la logique (settings.ts) sur l'API et le téléphone.
//  - ouverture : GET /me/profile ; les seuils du serveur remplacent la copie du téléphone (message de
//    sécurité hors-ligne à la saisie, L2-04), au cas où ils auraient changé ailleurs ;
//  - enregistrement : PUT /me/profile (profil complet), puis unité de saisie et seuils gardés sur le
//    téléphone. Le tableau de bord et la chronologie les relisent en revenant à l'écran.
import { useCallback, useEffect, useState } from 'react';
import { writeUnit } from '@/features/measurements';
import { profileApi, type PatientProfileResponse } from './api';
import { saveThresholds } from './local-thresholds';
import {
  checkUnitsDraft,
  draftFromProfile,
  hasChanges,
  unitsProblem,
  type UnitsDraft,
  type UnitsProblem,
} from './settings';
import type { StepErrors } from './wizard';

export type UnitsSettingsState =
  | { status: 'loading' }
  | { status: 'failed'; problem: UnitsProblem }
  | {
      status: 'ready';
      profile: PatientProfileResponse;
      draft: UnitsDraft;
      errors: StepErrors;
      saving: boolean;
      saved: boolean;
      problem: UnitsProblem | null;
    };

export function useUnitsSettings() {
  const [state, setState] = useState<UnitsSettingsState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const profile = await profileApi.get();
      await saveThresholds(profile.thresholds);
      setState({
        status: 'ready',
        profile,
        draft: draftFromProfile(profile),
        errors: {},
        saving: false,
        saved: false,
        problem: null,
      });
    } catch (error) {
      setState({ status: 'failed', problem: unitsProblem(error) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Modifie le brouillon ; l'erreur d'un champ modifié disparaît, le message « enregistré » aussi. */
  const change = (patch: Partial<UnitsDraft>) =>
    setState((current) => {
      if (current.status !== 'ready') return current;
      const errors = { ...current.errors };
      for (const key of Object.keys(patch.thresholds ?? {})) delete errors[`thresholds.${key}`];
      if (patch.unit) for (const key of Object.keys(errors)) delete errors[key];
      return { ...current, draft: { ...current.draft, ...patch }, errors, saved: false };
    });

  const save = async () => {
    if (state.status !== 'ready' || state.saving) return;
    const check = checkUnitsDraft(state.profile, state.draft);
    if (!check.ok) {
      setState({ ...state, errors: check.errors, saved: false });
      return;
    }
    setState({ ...state, saving: true, problem: null, errors: {} });
    try {
      const profile = await profileApi.save(check.payload);
      writeUnit(profile.preferredUnit); // la saisie des mesures s'ouvrira dans cette unité
      await saveThresholds(profile.thresholds);
      setState({
        status: 'ready',
        profile,
        draft: draftFromProfile(profile),
        errors: {},
        saving: false,
        saved: true,
        problem: null,
      });
    } catch (error) {
      setState((current) =>
        current.status === 'ready'
          ? { ...current, saving: false, problem: unitsProblem(error) }
          : current,
      );
    }
  };

  /** Revient aux valeurs enregistrées (annule les modifications en cours). */
  const discard = () =>
    setState((current) =>
      current.status === 'ready'
        ? { ...current, draft: draftFromProfile(current.profile), errors: {}, problem: null }
        : current,
    );

  const changed = state.status === 'ready' && hasChanges(state.profile, state.draft);
  return { state, change, save, discard, retry: load, changed };
}
