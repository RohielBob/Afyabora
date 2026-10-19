// Réglages → Unités et seuils (L1-05, CDC F1) : la LOGIQUE, sans interface (testée dans
// __tests__/settings.test.ts). Même saisie que l'étape 3 de l'assistant de profil (wizard.ts) : valeurs
// affichées dans l'unité choisie (virgule décimale), envoyées en mg/dL entiers (ADR-0002).
//
// PUT /me/profile REMPLACE tout le profil (un champ absent est effacé, voir le README de l'API) : on renvoie
// donc le profil lu sur le serveur À L'IDENTIQUE (nom, contacts, pays…), en ne changeant que l'unité, les
// seuils et la case « définis avec mon médecin ».
import { patientProfileSchema, type GlucoseUnit, type PatientProfileInput } from '@glyka/shared';
import { ApiError } from '@/lib/api-client';
import type { PatientProfileResponse } from './api';
import {
  THRESHOLD_KEYS,
  displayToMgDl,
  thresholdsInUnit,
  type StepErrors,
  type ThresholdKey,
} from './wizard';

/** Ce que l'écran modifie. Les seuils sont le TEXTE affiché, dans l'unité `unit`. */
export interface UnitsDraft {
  unit: GlucoseUnit;
  thresholds: Record<ThresholdKey, string>;
  reviewed: boolean;
}

export function draftFromProfile(profile: PatientProfileResponse): UnitsDraft {
  return {
    unit: profile.preferredUnit,
    thresholds: thresholdsInUnit(profile.thresholds, profile.preferredUnit),
    reviewed: profile.thresholdsReviewedByClinician,
  };
}

/** Seuils du brouillon en mg/dL (null pour une valeur illisible). */
export function draftMgDl(draft: UnitsDraft): Record<ThresholdKey, number | null> {
  return Object.fromEntries(
    THRESHOLD_KEYS.map((key) => [key, displayToMgDl(draft.thresholds[key], draft.unit)]),
  ) as Record<ThresholdKey, number | null>;
}

/**
 * Profil complet à renvoyer : celui du serveur, avec l'unité et les seuils du brouillon. `updatedAt` n'est pas
 * envoyé : patientProfileSchema ne garde que les champs qu'il connaît. Une valeur illisible devient NaN, que le
 * schéma refuse avec une erreur sur CE seuil.
 */
function payloadOf(profile: PatientProfileResponse, draft: UnitsDraft): Record<string, unknown> {
  return {
    ...profile,
    preferredUnit: draft.unit,
    thresholds: Object.fromEntries(
      Object.entries(draftMgDl(draft)).map(([key, mgDl]) => [key, mgDl ?? NaN]),
    ),
    thresholdsReviewedByClinician: draft.reviewed,
  };
}

export type UnitsCheck =
  { ok: true; payload: PatientProfileInput } | { ok: false; errors: StepErrors };

/**
 * Vérifie le brouillon avec le schéma du serveur (patientProfileSchema). Erreurs : seulement celles des
 * seuils (chemin « thresholds.veryLowMgDl » → message i18n de l'assistant). Une erreur sur un AUTRE champ
 * (profil abîmé côté serveur) bloque aussi l'envoi, sous la clé « profile ».
 */
export function checkUnitsDraft(profile: PatientProfileResponse, draft: UnitsDraft): UnitsCheck {
  const result = patientProfileSchema.safeParse(payloadOf(profile, draft));
  if (result.success) return { ok: true, payload: result.data };
  const errors: StepErrors = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.');
    if (path.startsWith('thresholds')) errors[path] ??= `onboarding.errors.${path}`;
    else errors.profile ??= 'settings.unitsScreen.problem.profile';
  }
  return { ok: false, errors };
}

/** Vrai si quelque chose a changé par rapport au profil enregistré (sinon « Enregistrer » est inutile). */
export function hasChanges(profile: PatientProfileResponse, draft: UnitsDraft): boolean {
  if (draft.unit !== profile.preferredUnit) return true;
  if (draft.reviewed !== profile.thresholdsReviewedByClinician) return true;
  const mgDl = draftMgDl(draft);
  return THRESHOLD_KEYS.some((key) => mgDl[key] !== profile.thresholds[key]);
}

/** Pourquoi le chargement ou l'enregistrement a échoué (l'écran traduit chaque cas). */
export type UnitsProblem = 'offline' | 'noProfile' | 'invalid' | 'error';

export function unitsProblem(error: unknown): UnitsProblem {
  if (!(error instanceof ApiError)) return 'error';
  if (error.status === 0) return 'offline';
  if (error.status === 404) return 'noProfile';
  if (error.status === 400) return 'invalid';
  return 'error';
}
