// Scan du QR d'un patient (L5-10, CDC F8) : règles pures, testées sans navigateur (__tests__/claim.test.ts).
//  - Le texte lu (caméra, photo) ou saisi (code de secours) est NETTOYÉ puis CONTRÔLÉ avant d'appeler le
//    serveur : un QR qui n'est pas un QR Afyabora (adresse web, autre application…) est signalé tout de
//    suite, sans requête. Le serveur bloque après 5 scans ratés par minute (L5-03) : inutile d'y envoyer
//    ce qui ne peut pas être un jeton.
//  - Échec du serveur ⇒ message clair, SANS détailler la cause d'un QR refusé (inconnu, expiré, déjà
//    utilisé : même message, comme le serveur, README de la feature).
import { ApiError } from '@/lib/api-client';

/** Forme exacte d'un jeton de partage : 32 octets en base64url, 43 caractères (API, share-token.ts). */
const SHARE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Texte lu ou saisi ⇒ jeton, ou null s'il ne peut pas en être un. Les espaces, retours à la ligne et
 * tabulations sont retirés (code recopié en plusieurs morceaux, collé avec un retour à la ligne) ; les
 * tirets et soulignés sont GARDÉS : ils font partie du jeton.
 */
export function readShareToken(text: string): string | null {
  const token = text.replace(/\s+/g, '');
  return SHARE_TOKEN.test(token) ? token : null;
}

export type ClaimProblem =
  /** Le texte n'est pas un jeton Afyabora (pas de requête envoyée). */
  | { kind: 'notAfyabora' }
  /** QR refusé par le serveur : inconnu, expiré ou déjà utilisé (sans préciser). */
  | { kind: 'invalid' }
  /** Compte médecin pas (encore) approuvé. */
  | { kind: 'notApproved' }
  /** Trop de scans ratés : patienter `seconds` secondes. */
  | { kind: 'blocked'; seconds: number }
  | { kind: 'network' }
  | { kind: 'server' };

/** Échec de POST /shares/claim ⇒ problème à expliquer au médecin. */
export function claimProblem(error: unknown): ClaimProblem {
  if (!(error instanceof ApiError)) return { kind: 'server' };
  if (error.status === 0) return { kind: 'network' };
  if (error.status === 404 || error.status === 400) return { kind: 'invalid' };
  if (error.status === 403 && error.code === 'DOCTOR_NOT_APPROVED') return { kind: 'notApproved' };
  if (error.status === 429)
    return { kind: 'blocked', seconds: Math.max(1, error.retryAfterSeconds ?? 60) };
  return { kind: 'server' };
}

/** Problème de caméra ⇒ type de message (les navigateurs donnent des noms d'erreur différents). */
export type CameraProblem = 'denied' | 'none' | 'busy' | 'insecure' | 'other';

export function cameraProblem(error: unknown, secure = true): CameraProblem {
  if (!secure) return 'insecure'; // la caméra n'est donnée qu'en https (ou sur localhost)
  const text = `${(error as { name?: string })?.name ?? ''} ${String((error as Error)?.message ?? error)}`;
  if (/NotAllowed|Permission|denied/i.test(text)) return 'denied';
  if (/NotFound|DevicesNotFound|no camera|Requested device not found/i.test(text)) return 'none';
  if (/NotReadable|TrackStart|in use|Could not start/i.test(text)) return 'busy';
  return 'other';
}
