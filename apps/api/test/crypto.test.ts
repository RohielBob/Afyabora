import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptField, encryptField } from '../src/common/crypto/field-encryption';
import { generateOpaqueToken, hashToken } from '../src/common/crypto/tokens';

const key = randomBytes(32).toString('base64');

describe('chiffrement des champs', () => {
  it('aller-retour', () =>
    expect(decryptField(encryptField('note privée', key), key)).toBe('note privée'));
  it('un champ modifié est rejeté', () => {
    const [iv, tag, data] = encryptField('secret', key).split(':');
    const tampered = [iv, tag, Buffer.from('xxxxxx').toString('base64')].join(':');
    expect(() => decryptField(tampered, key)).toThrow();
    expect(data).toBeDefined();
  });
});

describe('jetons opaques', () => {
  it('deux jetons sont différents et longs', () => {
    const a = generateOpaqueToken();
    expect(a).not.toBe(generateOpaqueToken());
    expect(a.length).toBeGreaterThanOrEqual(43);
  });
  it('le hash est déterministe et ne contient pas le jeton', () => {
    const t = generateOpaqueToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
  });
});
