// Ticket L1-06 : logique des écrans d'authentification (sans interface) — validation, lien collé,
// messages d'erreur. La session (connexion, renouvellement, déconnexion) est testée dans session.test.ts.
import { ApiError } from '@/lib/api-client';
import { authErrorMessage } from '../errors';
import { extractToken } from '../link-token';
import { pendingRegistration } from '../pending-registration';
import { passwordChecks, validateSignIn, validateSignUp } from '../validation';

const TOKEN = 'k3Zt9Qw2Vx7LpR4mNc8YbH1sDfG6jAe5UoI0TyXvWzE';

describe('validation des formulaires (mêmes règles que le serveur)', () => {
  it('inscription : refuse email invalide, mot de passe de 8 caractères et consentement absent', () => {
    expect(
      validateSignUp({ email: 'pas-une-adresse', password: 'abcdefgh', consent: false }),
    ).toEqual({
      email: 'auth.validation.email',
      password: 'auth.validation.passwordLength',
      consent: 'auth.validation.consent',
    });
  });

  it('inscription : accepte des données valides', () => {
    expect(
      validateSignUp({
        email: 'jean@example.com',
        password: 'une-phrase-solide-2026',
        consent: true,
      }),
    ).toEqual({});
  });

  it('connexion : exige un email valide et un mot de passe non vide (sans règle de longueur)', () => {
    expect(validateSignIn({ email: 'jean@example.com', password: '' })).toEqual({
      password: 'auth.validation.passwordRequired',
    });
    expect(validateSignIn({ email: 'jean@example.com', password: 'court' })).toEqual({});
  });

  it('la règle « 12 caractères » se coche exactement à 12', () => {
    expect(passwordChecks('a'.repeat(11))[0]?.ok).toBe(false);
    expect(passwordChecks('a'.repeat(12))[0]?.ok).toBe(true);
  });
});

describe('lien ou code collé par la personne', () => {
  it('extrait le jeton d’un lien complet de vérification ou de réinitialisation', () => {
    expect(extractToken(`http://localhost:5173/verify-email?token=${TOKEN}`)).toBe(TOKEN);
    expect(extractToken(`https://portail.afyabora.app/reset-password?lang=fr&token=${TOKEN}`)).toBe(
      TOKEN,
    );
  });

  it('accepte le code seul, avec des espaces autour', () => {
    expect(extractToken(`  ${TOKEN}\n`)).toBe(TOKEN);
  });

  it('refuse un texte vide, trop court ou contenant des caractères inattendus', () => {
    expect(extractToken('')).toBeNull();
    expect(extractToken('abc')).toBeNull();
    expect(extractToken('http://exemple.com/verify-email')).toBeNull();
    expect(extractToken('<script>alert(1)</script>-------------')).toBeNull();
  });
});

describe('messages d’erreur (ce que voit la personne)', () => {
  const err = (status: number, body?: unknown) => new ApiError(status, 'x', body);

  it('réseau coupé ou serveur arrêté', () => {
    expect(authErrorMessage(err(0), 'login')).toEqual({ key: 'errors.network' });
  });

  it('connexion : email ou mot de passe incorrect (même message)', () => {
    expect(authErrorMessage(err(401, { message: 'x' }), 'login')).toEqual({
      key: 'auth.errors.invalidCredentials',
    });
  });

  it('connexion : email non vérifié, avec l’action « vérifier mon adresse »', () => {
    expect(authErrorMessage(err(403, { code: 'EMAIL_NOT_VERIFIED' }), 'login')).toEqual({
      key: 'auth.errors.emailNotVerified',
      action: 'verifyEmail',
    });
  });

  it('compte verrouillé : durée en minutes, arrondie au-dessus', () => {
    expect(
      authErrorMessage(err(429, { code: 'ACCOUNT_LOCKED', retryAfterSeconds: 540 }), 'login'),
    ).toEqual({ key: 'auth.errors.locked', params: { minutes: 9 } });
  });

  it('trop de demandes (limite par IP) et erreur serveur', () => {
    expect(authErrorMessage(err(429), 'register')).toEqual({ key: 'errors.tooManyRequests' });
    expect(authErrorMessage(err(503), 'register')).toEqual({ key: 'errors.server' });
  });

  it('lien invalide : message adapté à la vérification ou à la réinitialisation', () => {
    expect(authErrorMessage(err(400, { code: 'TOKEN_INVALID' }), 'verify').key).toBe(
      'auth.errors.verifyLinkInvalid',
    );
    expect(authErrorMessage(err(400, { code: 'TOKEN_INVALID' }), 'reset').key).toBe(
      'auth.errors.resetLinkInvalid',
    );
  });

  it('erreur qui ne vient pas de l’API', () => {
    expect(authErrorMessage(new Error('boom'), 'login')).toEqual({ key: 'errors.unexpected' });
  });
});

describe('inscription en attente (pour « Renvoyer l’email »)', () => {
  it('n’est rendue que pour la même adresse, et s’efface', () => {
    const input = {
      email: 'jean@example.com',
      password: 'une-phrase-solide-2026',
      consent: true as const,
    };
    pendingRegistration.set(input);
    expect(pendingRegistration.get('autre@example.com')).toBeNull();
    expect(pendingRegistration.get('jean@example.com')).toEqual(input);
    pendingRegistration.clear();
    expect(pendingRegistration.get('jean@example.com')).toBeNull();
  });
});
