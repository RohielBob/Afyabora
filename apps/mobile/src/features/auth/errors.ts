// Traduit une erreur de l'API en message compréhensible (clé i18n + paramètres).
// Principe : dire à la personne QUOI FAIRE, sans détail technique et sans révéler si un compte existe.
import { ApiError } from '@/lib/api-client';

export interface ErrorMessage {
  /** Clé de traduction (fr.json / en.json). */
  key: string;
  params?: Record<string, string | number>;
  /** Action proposée à côté du message. */
  action?: 'verifyEmail';
}

export type AuthContext = 'login' | 'register' | 'verify' | 'forgot' | 'reset';

export function authErrorMessage(error: unknown, context: AuthContext): ErrorMessage {
  if (!(error instanceof ApiError)) return { key: 'errors.unexpected' };

  if (error.status === 0) return { key: 'errors.network' };

  if (error.code === 'ACCOUNT_LOCKED') {
    const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds ?? 600) / 60));
    return { key: 'auth.errors.locked', params: { minutes } };
  }
  if (error.status === 429) return { key: 'errors.tooManyRequests' };

  if (error.code === 'EMAIL_NOT_VERIFIED') {
    return { key: 'auth.errors.emailNotVerified', action: 'verifyEmail' };
  }
  if (error.code === 'TOKEN_INVALID') {
    return {
      key: context === 'reset' ? 'auth.errors.resetLinkInvalid' : 'auth.errors.verifyLinkInvalid',
    };
  }
  if (context === 'login' && error.status === 401) return { key: 'auth.errors.invalidCredentials' };
  if (error.status === 400) return { key: 'errors.invalidData' };
  if (error.status >= 500) return { key: 'errors.server' };
  return { key: 'errors.unexpected' };
}
