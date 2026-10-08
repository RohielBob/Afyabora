import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateEnv } from '../src/config/env';

// Une configuration valide, avec de vrais secrets générés au hasard (jamais ceux d'un vrai environnement).
function validEnv(): Record<string, string> {
  return {
    DATABASE_URL: 'postgresql://utilisateur:motdepasse@localhost:5432/base',
    JWT_ACCESS_SECRET: randomBytes(48).toString('base64'),
    FIELD_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  };
}

describe('validation de la configuration', () => {
  it('accepte une configuration valide et applique les valeurs par défaut', () => {
    const env = validateEnv(validEnv());
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.SMTP_PORT).toBe(1025);
  });

  it("refuse le secret JWT d'exemple de .env.example", () => {
    expect(() =>
      validateEnv({
        ...validEnv(),
        JWT_ACCESS_SECRET: 'change-me-access-secret-at-least-32-chars',
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('refuse un secret JWT trop court', () => {
    expect(() => validateEnv({ ...validEnv(), JWT_ACCESS_SECRET: 'trop-court' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it("refuse la clé de chiffrement d'exemple de .env.example", () => {
    expect(() =>
      validateEnv({ ...validEnv(), FIELD_ENCRYPTION_KEY: 'change-me-base64-32-bytes' }),
    ).toThrow(/FIELD_ENCRYPTION_KEY/);
  });

  it('refuse une clé de chiffrement qui ne fait pas 32 octets', () => {
    expect(() =>
      validateEnv({ ...validEnv(), FIELD_ENCRYPTION_KEY: randomBytes(16).toString('base64') }),
    ).toThrow(/FIELD_ENCRYPTION_KEY/);
  });

  it('refuse une configuration sans adresse de base de données', () => {
    const { DATABASE_URL: _absente, ...sansBase } = validEnv();
    expect(() => validateEnv(sansBase)).toThrow(/DATABASE_URL/);
  });

  it("ne révèle jamais la valeur des secrets dans le message d'erreur", () => {
    const secret = 'change-me-ceci-ne-doit-jamais-apparaitre-dans-un-journal';
    let message = '';
    try {
      validateEnv({ ...validEnv(), JWT_ACCESS_SECRET: secret });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('Configuration invalide');
    expect(message).not.toContain(secret);
  });
});
