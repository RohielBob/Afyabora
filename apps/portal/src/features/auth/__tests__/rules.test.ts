// Ticket L1-11 : règles de l'authentification médecin (sans interface).
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { fr } from '@/i18n/fr';
import {
  IDLE_LIMIT_MS,
  authErrorMessage,
  destinationFor,
  doctorPayload,
  parseStoredSession,
  tokenFromSearch,
  validateDoctorSignUp,
  validateSignIn,
  type DoctorSignUpValues,
} from '../rules';

const TOKEN = 'k3Zt9Qw2Vx7LpR4mNc8YbH1sDfG6jAe5UoI0TyXvWzE';

const VALID: DoctorSignUpValues = {
  firstName: ' Amina ',
  lastName: 'Kabila',
  licenseNumber: 'CNOM-12345',
  institution: 'Hôpital de référence',
  email: ' Dr.Amina@Example.ORG ',
  password: 'une-phrase-solide-2026',
  attest: true,
  terms: true,
};

describe('page après connexion', () => {
  it('médecin approuvé → patients ; en attente ou refusé → page « en attente »', () => {
    expect(destinationFor({ role: 'DOCTOR', status: 'APPROVED' })).toBe('patients');
    expect(destinationFor({ role: 'DOCTOR', status: 'PENDING' })).toBe('pending');
    expect(destinationFor({ role: 'DOCTOR', status: 'REJECTED' })).toBe('pending');
    expect(destinationFor({ role: 'DOCTOR', status: null })).toBe('pending');
  });

  it('patient ou admin : pas d’accès au portail médecin', () => {
    expect(destinationFor({ role: 'PATIENT', status: null })).toBe('notDoctor');
    expect(destinationFor({ role: 'ADMIN', status: null })).toBe('notDoctor');
  });
});

describe('inscription médecin (mêmes règles que le serveur)', () => {
  it('accepte un formulaire complet', () => {
    expect(validateDoctorSignUp(VALID)).toEqual({});
  });

  it('refuse un formulaire vide, champ par champ', () => {
    const errors = validateDoctorSignUp({
      firstName: ' ',
      lastName: '',
      licenseNumber: 'AB',
      institution: 'X',
      email: 'pas-une-adresse',
      password: 'abcdefgh',
      attest: false,
      terms: false,
    });
    expect(errors).toEqual({
      firstName: fr.validation.firstName,
      lastName: fr.validation.lastName,
      licenseNumber: fr.validation.licenseNumber,
      institution: fr.validation.institution,
      email: fr.validation.email,
      password: fr.validation.passwordLength,
      attest: fr.validation.attest,
      terms: fr.validation.terms,
    });
  });

  it('chaque case est exigée séparément', () => {
    expect(validateDoctorSignUp({ ...VALID, attest: false })).toEqual({
      attest: fr.validation.attest,
    });
    expect(validateDoctorSignUp({ ...VALID, terms: false })).toEqual({
      terms: fr.validation.terms,
    });
  });

  it('envoie des valeurs nettoyées et consent = true (contrat inchangé)', () => {
    expect(doctorPayload(VALID)).toEqual({
      firstName: 'Amina',
      lastName: 'Kabila',
      licenseNumber: 'CNOM-12345',
      institution: 'Hôpital de référence',
      email: 'dr.amina@example.org',
      password: 'une-phrase-solide-2026',
      consent: true,
    });
  });

  it('connexion : email valide et mot de passe non vide (sans règle de longueur)', () => {
    expect(validateSignIn({ email: 'a@b.org', password: '' })).toEqual({
      password: fr.validation.passwordRequired,
    });
    expect(validateSignIn({ email: 'a@b.org', password: 'court' })).toEqual({});
  });
});

describe('messages d’erreur de l’API', () => {
  const err = (status: number, body?: unknown) => new ApiError(status, 'x', body);

  it('identifiants incorrects, sans dire si le compte existe', () => {
    expect(authErrorMessage(err(401), 'login')).toBe(fr.errors.invalidCredentials);
  });

  it('compte bloqué : durée en minutes (arrondie au-dessus)', () => {
    expect(
      authErrorMessage(err(429, { code: 'ACCOUNT_LOCKED', retryAfterSeconds: 61 }), 'login'),
    ).toBe(fr.errors.locked.replace('{{minutes}}', '2'));
  });

  it('email non vérifié, lien invalide selon le contexte, réseau, serveur', () => {
    expect(authErrorMessage(err(403, { code: 'EMAIL_NOT_VERIFIED' }), 'login')).toBe(
      fr.errors.emailNotVerified,
    );
    expect(authErrorMessage(err(400, { code: 'TOKEN_INVALID' }), 'verify')).toBe(
      fr.errors.verifyLinkInvalid,
    );
    expect(authErrorMessage(err(400, { code: 'TOKEN_INVALID' }), 'reset')).toBe(
      fr.errors.resetLinkInvalid,
    );
    expect(authErrorMessage(err(0), 'login')).toBe(fr.errors.network);
    expect(authErrorMessage(err(503), 'register')).toBe(fr.errors.server);
    expect(authErrorMessage(err(429), 'register')).toBe(fr.errors.tooManyRequests);
    expect(authErrorMessage(new Error('boom'), 'login')).toBe(fr.errors.unexpected);
  });
});

describe('liens reçus par email', () => {
  it('lit le jeton de l’adresse, refuse un jeton absent ou mal formé', () => {
    expect(tokenFromSearch(`?token=${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromSearch('')).toBeNull();
    expect(tokenFromSearch('?token=court')).toBeNull();
    expect(tokenFromSearch('?token=<script>alert(1)</script>xxxxxxxxxxxx')).toBeNull();
  });
});

describe('session enregistrée dans l’onglet', () => {
  const now = Date.UTC(2026, 9, 10, 12, 0, 0);
  const session = {
    refreshToken: TOKEN,
    lastActive: now - 60_000,
    user: { id: 'u1', role: 'DOCTOR', status: 'PENDING', email: 'dr@ex.org' },
  };

  it('relit une session valide', () => {
    expect(parseStoredSession(JSON.stringify(session), now)).toEqual(session);
  });

  it('refuse une session abîmée ou modifiée à la main', () => {
    expect(parseStoredSession('{pas du json', now)).toBeNull();
    expect(parseStoredSession(JSON.stringify({ ...session, refreshToken: 42 }), now)).toBeNull();
    expect(
      parseStoredSession(
        JSON.stringify({ ...session, user: { ...session.user, status: 'SUPER_ADMIN' } }),
        now,
      ),
    ).toBeNull();
  });

  it(`ne reprend pas une session inactive depuis plus de ${IDLE_LIMIT_MS / 60_000} min`, () => {
    const old = { ...session, lastActive: now - IDLE_LIMIT_MS - 1 };
    expect(parseStoredSession(JSON.stringify(old), now)).toBeNull();
  });
});
