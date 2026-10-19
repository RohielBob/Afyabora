// Envoi d'emails (vérification d'adresse, mot de passe oublié…) via SMTP.
// En développement, le serveur SMTP est Mailpit (docker compose) : les emails sont visibles sur http://localhost:8025
// et ne partent jamais vers une vraie boîte. Hébergé (L0-10) : un vrai service d'envoi (ex. Brevo), avec
// identifiant, mot de passe et connexion chiffrée (smtpOptions). Règle : ne JAMAIS journaliser l'adresse, le
// contenu, un jeton ni le mot de passe SMTP.
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

/** Réglages SMTP lus dans la configuration (voir src/config/env.ts). */
export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
}

/**
 * Options de connexion :
 *  - sans identifiant (Mailpit) : en clair, sans authentification ;
 *  - avec identifiant : authentification, et connexion TOUJOURS chiffrée : TLS direct (`secure`, port 465)
 *    ou STARTTLS exigé (port 587). Un mot de passe ne part jamais en clair.
 */
export function smtpOptions(settings: SmtpSettings): SMTPTransport.Options {
  const base = { host: settings.host, port: settings.port, secure: settings.secure };
  if (!settings.user) return base;
  return {
    ...base,
    auth: { user: settings.user, pass: settings.pass ?? '' },
    requireTLS: !settings.secure,
  };
}

export interface OutgoingMail {
  to: string;
  subject: string;
  /** Version texte : lisible par tous les clients mail. */
  text: string;
  /** Version HTML : même contenu, avec un lien cliquable. */
  html: string;
  /** Adresse qui reçoit les réponses (ex. boîte de l'équipe), quand l'expéditeur ne peut pas en recevoir. */
  replyTo?: string;
}

@Injectable()
export class MailService {
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  /** Création paresseuse : l'API (et les tests) démarrent même si le serveur SMTP n'est pas lancé. */
  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = createTransport(
        smtpOptions({
          host: this.config.getOrThrow<string>('SMTP_HOST'),
          port: this.config.getOrThrow<number>('SMTP_PORT'),
          secure: this.config.get<boolean>('SMTP_SECURE') ?? false,
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASS'),
        }),
      );
    }
    return this.transporter;
  }

  async send(mail: OutgoingMail): Promise<void> {
    await this.getTransporter().sendMail({
      from: this.config.getOrThrow<string>('SMTP_FROM'),
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
    });
  }
}
