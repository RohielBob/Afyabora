// Jetons du QR de partage (ADR-0003, CDC F7) : fonctions PURES, testées dans test/sharing-token.test.ts.
//  - Le jeton est ALÉATOIRE et OPAQUE : 32 octets du générateur cryptographique, en base64url (43 caractères,
//    sans « + / = » : il passe tel quel dans un QR et dans une URL). Il ne contient AUCUNE donnée : ni le
//    patient, ni la session, ni une donnée de santé.
//  - Seul son HASH SHA-256 est enregistré : une fuite de la base ne donne aucun jeton utilisable.
//  - Il vaut 60 s (SHARE_TOKEN_TTL_SECONDS) et ne sert qu'une fois (consommation atomique : L5-02 / L5-03).
import { createHash, randomBytes } from 'node:crypto';
import { SHARE_TOKEN_TTL_SECONDS } from '@glyka/shared';

/** Taille du jeton en octets (ADR-0003 : au moins 32). */
export const SHARE_TOKEN_BYTES = 32;

/** Forme exacte d'un jeton émis : 32 octets en base64url, soit 43 caractères. */
const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Le texte lu dans un QR a-t-il la forme d'un jeton Afyabora ? Un texte quelconque (autre QR, saisie
 * fantaisiste) est écarté AVANT toute lecture en base (L5-02).
 */
export function isWellFormedShareToken(token: unknown): token is string {
  return typeof token === 'string' && SHARE_TOKEN_PATTERN.test(token);
}

/** Empreinte enregistrée en base (hexadécimal, 64 caractères). */
export function hashShareToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export interface IssuedShareToken {
  /** À renvoyer au patient (contenu du QR) ; JAMAIS enregistré ni journalisé. */
  token: string;
  /** Seule trace en base. */
  tokenHash: string;
  expiresAt: Date;
}

/** Nouveau jeton, valable SHARE_TOKEN_TTL_SECONDS à partir de `now`. */
export function issueShareToken(
  now: Date,
  random: (size: number) => Buffer = randomBytes,
): IssuedShareToken {
  const token = random(SHARE_TOKEN_BYTES).toString('base64url');
  return {
    token,
    tokenHash: hashShareToken(token),
    expiresAt: new Date(now.getTime() + SHARE_TOKEN_TTL_SECONDS * 1000),
  };
}
