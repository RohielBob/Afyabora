// Carte d'urgence (L6-05, CDC F10) : règles PURES, testées sans base dans test/emergency-card.test.ts.
//  - Jeton du QR d'urgence : même fabrication que le QR de partage (ADR-0003) : 32 octets aléatoires en
//    base64url, seul son HASH SHA-256 est enregistré. Contrairement au QR de partage, il est STABLE (on peut
//    l'imprimer, le mettre en fond d'écran) : il ne sert plus que s'il est désactivé ou régénéré.
//  - Page publique : UNIQUEMENT les champs renseignés par le patient (un champ vide n'existe pas dans la
//    réponse) et la date de mise à jour. Jamais d'historique, d'identifiant ni l'état « activé ».
//  - Notification au patient : aucune donnée de santé dans le texte (écran verrouillé).
import { randomBytes } from 'node:crypto';
import {
  EMERGENCY_CARD_FIELDS,
  type EmergencyCardInput,
  type EmergencyCardPublic,
  type EmergencyCardResponse,
} from '@glyka/shared';
import type { EmergencyCard } from '@prisma/client';
import { hashShareToken, isWellFormedShareToken, SHARE_TOKEN_BYTES } from '../sharing/share-token';

/** Nouveau jeton de QR d'urgence : à montrer UNE fois au patient ; seul `tokenHash` est enregistré. */
export function issueEmergencyToken(random: (size: number) => Buffer = randomBytes): {
  token: string;
  tokenHash: string;
} {
  const token = random(SHARE_TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashShareToken(token) };
}

/** Un texte lu dans l'adresse a-t-il la forme d'un jeton ? Sinon : 404, sans lecture en base. */
export const isWellFormedEmergencyToken = isWellFormedShareToken;
export const hashEmergencyToken = hashShareToken;

/** Adresse mise dans le QR : la page publique du portail, lisible avec n'importe quel téléphone. */
export function emergencyUrl(portalUrl: string, token: string): string {
  return `${portalUrl.replace(/\/+$/, '')}/e/${token}`;
}

/** Colonnes de la carte (toutes facultatives) ; un texte vide est enregistré comme « absent ». */
export function cardColumns(input: EmergencyCardInput) {
  const text = (value: string | undefined) => (value && value.trim() ? value.trim() : null);
  return {
    fullName: text(input.fullName),
    diabetesType: text(input.diabetesType),
    declaredTreatment: text(input.declaredTreatment),
    allergies: text(input.allergies),
    bloodGroup: input.bloodGroup ?? null,
    lastKnownGlucoseMgDl: input.lastKnownGlucoseMgDl ?? null,
    emergencyContactName: text(input.emergencyContactName),
    emergencyContactPhone: text(input.emergencyContactPhone),
    enabled: input.enabled,
  };
}

/** Les champs renseignés seulement (un champ vide n'apparaît pas). */
function filledFields(card: EmergencyCard): Partial<EmergencyCardPublic> {
  const out: Record<string, unknown> = {};
  for (const field of EMERGENCY_CARD_FIELDS) {
    const value = card[field];
    if (value !== null && value !== '') out[field] = value;
  }
  return out as Partial<EmergencyCardPublic>;
}

/** GET /emergency, PUT /emergency : la carte du patient. */
export function cardResponse(card: EmergencyCard): EmergencyCardResponse {
  return {
    ...filledFields(card),
    enabled: card.enabled,
    updatedAt: card.updatedAt.toISOString(),
    qrActive: card.tokenHash !== null,
  };
}

/** GET /e/:token : ce que voit le secouriste. Rien d'autre que les champs choisis et la date. */
export function publicCard(card: EmergencyCard): EmergencyCardPublic {
  return { ...filledFields(card), updatedAt: card.updatedAt.toISOString() };
}

/**
 * Une notification au plus par période : un secouriste qui recharge la page ne déclenche pas dix
 * notifications. CHAQUE ouverture reste inscrite au journal.
 */
export const EMERGENCY_NOTIFY_WINDOW_MS = 5 * 60_000;

/** Texte de la notification : rien sur la santé du patient (il peut s'afficher sur l'écran verrouillé). */
export const EMERGENCY_NOTIFICATION = {
  category: 'EMERGENCY_ACCESS',
  title: 'Carte d’urgence consultée',
  body: 'Quelqu’un vient d’ouvrir votre carte d’urgence. Ouvrez Afyabora pour voir quand.',
  data: { kind: 'EMERGENCY_VIEWED' },
} as const;
