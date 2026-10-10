// Ajout rapide d'un événement (L2-10, CDC F4) : la LOGIQUE, sans interface (testée dans
// __tests__/entry.test.ts).
//  - repas (libellé, moment), activité (type, durée), traitement DÉCLARÉ par le patient (nom + note libre) ;
//  - mêmes règles que le serveur (schéma partagé) : libellé 1–120 caractères, détails ≤ 500, durée
//    1–1440 minutes, date au plus 5 minutes dans le futur ;
//  - un traitement n'a JAMAIS de calcul de dose : on enregistre seulement ce que la personne déclare.
import type { CreateLifeEventInput, LifeEventType } from '@glyka/shared';
import { isInFuture, resolveWhen, type WhenState } from '@/features/measurements';

/** Suggestions de libellé en un appui (clés i18n `event.suggestion.<clé>`), par type. */
export const LABEL_SUGGESTIONS: Record<LifeEventType, readonly string[]> = {
  MEAL: ['breakfast', 'lunch', 'dinner', 'snack'],
  ACTIVITY: ['walk', 'run', 'bike', 'football', 'dance', 'housework'],
  TREATMENT: [],
};

/** Durées proposées pour une activité (minutes). */
export const DURATION_PRESETS = [15, 30, 45, 60, 90] as const;

export const LABEL_MAX = 120;
export const DETAILS_MAX = 500;

export interface EventDraft {
  type: LifeEventType | null;
  label: string;
  details: string;
  /** Durée en minutes, telle que tapée (activité seulement). */
  duration: string;
  when: WhenState;
}

export type EventErrors = Partial<Record<'type' | 'label' | 'duration' | 'when', string>>;

/** Durée lue : entier de 1 à 1440 minutes, vide = pas de durée ; sinon null (illisible). */
export function parseDuration(text: string): number | undefined | null {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) return null;
  const minutes = Number(trimmed);
  return minutes >= 1 && minutes <= 1440 ? minutes : null;
}

/** Vérifie tout le formulaire (clés i18n `event.problem.*`). */
export function validateEvent(draft: EventDraft, now: Date): EventErrors {
  const errors: EventErrors = {};
  if (!draft.type) errors.type = 'event.problem.type';
  const label = draft.label.trim();
  if (!label) errors.label = 'event.problem.label';
  else if (label.length > LABEL_MAX) errors.label = 'event.problem.labelTooLong';
  if (draft.type === 'ACTIVITY' && parseDuration(draft.duration) === null) {
    errors.duration = 'event.problem.duration';
  }
  if (isInFuture(resolveWhen(draft.when, now), now)) errors.when = 'event.problem.future';
  return errors;
}

/** Données à écrire sur le téléphone (l'identifiant est généré par le dépôt local). */
export function toCreateEventInput(draft: EventDraft, now: Date): Omit<CreateLifeEventInput, 'id'> {
  if (!draft.type || !draft.label.trim()) throw new Error('Saisie incomplète');
  const details = draft.details.trim();
  // La durée n'a de sens que pour une activité : on l'ignore pour un repas ou un traitement.
  const duration = draft.type === 'ACTIVITY' ? parseDuration(draft.duration) : undefined;
  return {
    type: draft.type,
    occurredAt: resolveWhen(draft.when, now).toISOString(),
    label: draft.label.trim(),
    ...(details ? { details: details.slice(0, DETAILS_MAX) } : {}),
    ...(typeof duration === 'number' ? { durationMinutes: duration } : {}),
  };
}

/** Lit le type passé dans l'adresse (« ?type=MEAL ») ; tout autre texte est ignoré. */
export function parseEventType(raw: unknown): LifeEventType | null {
  return raw === 'MEAL' || raw === 'ACTIVITY' || raw === 'TREATMENT' ? raw : null;
}
