// Tickets L5-01 et L5-02 : jetons du QR de partage (share-token.ts), fonctions pures (ADR-0003).
import { createHash } from 'node:crypto';
import { SHARE_TOKEN_TTL_SECONDS } from '@glyka/shared';
import { describe, expect, it } from 'vitest';
import {
  SHARE_TOKEN_BYTES,
  hashShareToken,
  isWellFormedShareToken,
  issueShareToken,
} from '../src/modules/sharing/share-token';

const NOW = new Date('2026-10-18T08:00:00.000Z');

describe('issueShareToken', () => {
  it('32 octets aléatoires en base64url : 43 caractères, sans « + / = » (passe tel quel dans un QR)', () => {
    const { token } = issueShareToken(NOW);
    expect(SHARE_TOKEN_BYTES).toBeGreaterThanOrEqual(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('un jeton différent à chaque fois (1 000 tirages, aucun doublon)', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => issueShareToken(NOW).token));
    expect(tokens.size).toBe(1000);
  });

  it('valable 60 s exactement à partir de maintenant', () => {
    expect(issueShareToken(NOW).expiresAt.toISOString()).toBe(
      new Date(NOW.getTime() + SHARE_TOKEN_TTL_SECONDS * 1000).toISOString(),
    );
    expect(SHARE_TOKEN_TTL_SECONDS).toBe(60);
  });

  it('utilise le générateur fourni (cryptographique par défaut) et en tire bien 32 octets', () => {
    const asked: number[] = [];
    const issued = issueShareToken(NOW, (size) => {
      asked.push(size);
      return Buffer.alloc(size, 7);
    });
    expect(asked).toEqual([32]);
    expect(issued.token).toBe(Buffer.alloc(32, 7).toString('base64url'));
  });

  it('le hash accompagne le jeton ; le jeton n’apparaît pas dans le hash', () => {
    const issued = issueShareToken(NOW);
    expect(issued.tokenHash).toBe(hashShareToken(issued.token));
    expect(issued.tokenHash).not.toContain(issued.token);
  });
});

describe('hashShareToken', () => {
  it('SHA-256 en hexadécimal (64 caractères), toujours le même pour un même jeton', () => {
    const token = 'k3Zt9Qw2Vx7LpR4mNc8YbH1sDfG6jAe5UoI0TyXvWzE';
    expect(hashShareToken(token)).toBe(createHash('sha256').update(token).digest('hex'));
    expect(hashShareToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashShareToken(token)).toBe(hashShareToken(token));
    expect(hashShareToken(`${token}x`)).not.toBe(hashShareToken(token));
  });
});

describe('isWellFormedShareToken (L5-02)', () => {
  it('accepte les jetons émis', () => {
    for (let i = 0; i < 100; i++)
      expect(isWellFormedShareToken(issueShareToken(NOW).token)).toBe(true);
  });

  it.each([
    ['vide', ''],
    ['trop court (42)', 'a'.repeat(42)],
    ['trop long (44)', 'a'.repeat(44)],
    ['base64 classique (« + »)', `${'a'.repeat(42)}+`],
    ['base64 classique (« / »)', `${'a'.repeat(42)}/`],
    ['remplissage « = »', `${'a'.repeat(42)}=`],
    ['espace', `${'a'.repeat(42)} `],
    [
      'retour à la ligne',
      `${'a'.repeat(43)}
`,
    ],
    ['adresse web', 'https://afyabora.example/partage?jeton=abc'],
  ])('refuse : %s', (_label, text) => {
    expect(isWellFormedShareToken(text)).toBe(false);
  });

  it.each([[null], [undefined], [42], [{ token: 'a'.repeat(43) }]])(
    'refuse ce qui n’est pas du texte : %j',
    (value) => {
      expect(isWellFormedShareToken(value)).toBe(false);
    },
  );
});
