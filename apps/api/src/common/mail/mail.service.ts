// Envoi d'emails (vérification d'adresse, mot de passe oublié…) via SMTP.
// En développement, le serveur SMTP est Mailpit (docker compose) : les emails sont visibles sur http://localhost:8025
// et ne partent jamais vers une vraie boîte. Règle : ne JAMAIS journaliser l'adresse, le contenu ni un jeton.
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export interface OutgoingMail {
  to: string;
  subject: string;
  /** Version texte : lisible par tous les clients mail. */
  text: string;
  /** Version HTML : même contenu, avec un lien cliquable. */
  html: string;
}

@Injectable()
export class MailService {
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  /** Création paresseuse : l'API (et les tests) démarrent même si le serveur SMTP n'est pas lancé. */
  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = createTransport({
        host: this.config.getOrThrow<string>('SMTP_HOST'),
        port: this.config.getOrThrow<number>('SMTP_PORT'),
        secure: false, // Mailpit écoute en clair sur le port 1025 ; un SMTP de production configurera TLS
      });
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
    });
  }
}
