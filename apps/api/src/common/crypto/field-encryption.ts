// Chiffrement des champs sensibles (notes personnelles) : AES-256-GCM.
// Format stocké : base64(iv):base64(tag):base64(données)
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function keyFrom(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY doit contenir 32 octets (base64)');
  return key;
}

export function encryptField(plain: string, base64Key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(base64Key), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, data].map((b) => b.toString('base64')).join(':');
}

export function decryptField(payload: string, base64Key: string): string {
  const [iv, tag, data] = payload.split(':').map((p) => Buffer.from(p, 'base64'));
  if (!iv || !tag || !data) throw new Error('Champ chiffré invalide');
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(base64Key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/**
 * Texte libre facultatif (note d'une mesure, détail d'un événement) : espaces retirés ; vide → null ;
 * sinon chiffré.
 */
export function encryptOptionalText(
  text: string | undefined | null,
  base64Key: string,
): string | null {
  const value = text?.trim();
  return value ? encryptField(value, base64Key) : null;
}

/**
 * Lecture tolérante : null si rien n'est stocké ; null aussi si le texte est illisible (clé changée,
 * donnée abîmée), pour ne jamais bloquer une liste ou un export. `onUnreadable` permet de le compter.
 */
export function decryptOptionalText(
  payload: string | null,
  base64Key: string,
  onUnreadable?: () => void,
): string | null {
  if (!payload) return null;
  try {
    return decryptField(payload, base64Key);
  } catch {
    onUnreadable?.();
    return null;
  }
}
