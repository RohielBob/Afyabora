// Ticket L0-10 : options de connexion SMTP (smtpOptions). En développement, Mailpit en clair ; hébergé, un vrai
// service d'envoi avec identifiant : la connexion doit TOUJOURS être chiffrée (le mot de passe ne part
// jamais en clair).
import { describe, expect, it } from 'vitest';
import { smtpOptions } from '../src/common/mail/mail.service';

describe('options SMTP', () => {
  it('Mailpit (sans identifiant) : en clair, sans authentification', () => {
    expect(smtpOptions({ host: 'localhost', port: 1025, secure: false })).toEqual({
      host: 'localhost',
      port: 1025,
      secure: false,
    });
  });

  it('service d’envoi, port 587 : authentification et STARTTLS EXIGÉ', () => {
    expect(
      smtpOptions({
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        user: 'expediteur@exemple.test',
        pass: 'secret-de-test',
      }),
    ).toEqual({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: { user: 'expediteur@exemple.test', pass: 'secret-de-test' },
      requireTLS: true,
    });
  });

  it('service d’envoi, port 465 : TLS dès la connexion (STARTTLS inutile)', () => {
    const options = smtpOptions({
      host: 'smtp.exemple.test',
      port: 465,
      secure: true,
      user: 'u',
      pass: 'p',
    });
    expect(options).toMatchObject({
      secure: true,
      requireTLS: false,
      auth: { user: 'u', pass: 'p' },
    });
  });
});
