// Présentation des réponses de l'assistant (L9-09) : fonctions PURES, testées sans écran.
//  - chaque nature de réponse a une ICÔNE et un LIBELLÉ (jamais la couleur seule) ;
//  - une fiche citée dit si elle a été relue par un médecin ;
//  - l'urgence propose d'APPELER les numéros enregistrés dans le profil (jamais un numéro deviné).
import type { Ionicons } from '@expo/vector-icons';
import type { AssistantAnswerKind, KnowledgeSheetStatus } from '@glyka/shared';
import type { ComponentProps } from 'react';
import type { PatientProfileResponse } from '@/features/profile';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Nature d'une réponse : icône, clé de traduction du libellé, ton (l'urgence seule est en `danger`). */
export const KIND_PRESENTATION: Record<
  AssistantAnswerKind,
  { icon: IconName; labelKey: string; tone: 'muted' | 'danger' }
> = {
  MEASUREMENTS: {
    icon: 'analytics-outline',
    labelKey: 'assistant.kinds.measurements',
    tone: 'muted',
  },
  SHEET: { icon: 'document-text-outline', labelKey: 'assistant.kinds.sheet', tone: 'muted' },
  EMERGENCY: { icon: 'alert-circle', labelKey: 'assistant.kinds.emergency', tone: 'danger' },
  REFUSAL: { icon: 'hand-left-outline', labelKey: 'assistant.kinds.refusal', tone: 'muted' },
  OUT_OF_SCOPE: {
    icon: 'help-circle-outline',
    labelKey: 'assistant.kinds.outOfScope',
    tone: 'muted',
  },
};

/** Statut d'une fiche citée : relue par un médecin, ou pas encore (mention visible, ADR-0005 complétée). */
export const SOURCE_STATUS: Record<KnowledgeSheetStatus, { icon: IconName; labelKey: string }> = {
  VALIDATED: { icon: 'checkmark-circle', labelKey: 'assistant.source.validated' },
  DRAFT: { icon: 'alert-circle-outline', labelKey: 'assistant.source.draft' },
};

/** Questions proposées dans une conversation vide (une par source de réponse). */
export const SUGGESTIONS = ['week', 'evening', 'hba1c', 'hypo'] as const;
export type Suggestion = (typeof SUGGESTIONS)[number];

/**
 * Lien d'appel `tel:` d'un numéro saisi par le patient : on garde le « + » initial et les chiffres
 * (« +243 81 234 5678 » ⇒ « tel:+243812345678 ») ; null s'il n'y a pas au moins 3 chiffres.
 */
export function telUri(phone: string): string | null {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 3) return null;
  return `tel:${trimmed.startsWith('+') ? '+' : ''}${digits}`;
}

/** Un numéro à appeler en cas d'urgence. */
export interface EmergencyCall {
  kind: 'emergency' | 'relative' | 'doctor';
  /** Nom du proche ou du médecin (absent pour le numéro d'urgence). */
  name?: string;
  phone: string;
  uri: string;
}

/**
 * Numéros à appeler, dans l'ordre : le numéro d'urgence du pays (L9-03), le proche, le médecin. Seulement ce
 * que le patient a enregistré : aucun numéro n'est jamais deviné.
 */
export function emergencyCalls(
  profile: Pick<
    PatientProfileResponse,
    'emergencyNumber' | 'emergencyContact' | 'doctorContact'
  > | null,
): EmergencyCall[] {
  if (!profile) return [];
  const calls: EmergencyCall[] = [];
  const add = (kind: EmergencyCall['kind'], phone: string | undefined, name?: string) => {
    const uri = phone ? telUri(phone) : null;
    if (phone && uri) calls.push({ kind, phone, uri, ...(name ? { name } : {}) });
  };
  add('emergency', profile.emergencyNumber);
  add('relative', profile.emergencyContact?.phone, profile.emergencyContact?.name);
  add('doctor', profile.doctorContact?.phone, profile.doctorContact?.name);
  return calls;
}
