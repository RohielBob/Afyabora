// Jetons opaques (QR de partage, vérification d'email, refresh…).
// Règle : on ne stocke JAMAIS le jeton, seulement son hash SHA-256.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 32 octets aléatoires, encodés en base64url (≈ 43 caractères). */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
