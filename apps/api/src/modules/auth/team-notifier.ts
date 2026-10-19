// Alertes envoyées à la boîte de l'ÉQUIPE (TEAM_NOTIFY_EMAIL) : nouveau médecin inscrit, médecin à vérifier,
// décision envoyée. Boîte non configurée ⇒ rien n'est envoyé. Envoi NON attendu : une panne du service
// d'envoi ne change jamais la réponse donnée à l'utilisateur (même règle que l'email de vérification).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { MailService, type OutgoingMail } from '../../common/mail/mail.service';
import type { DoctorSummary } from './doctor-review.mails';

@Injectable()
export class TeamNotifier {
  private readonly logger = new Logger('TeamNotifier');

  constructor(
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /** Boîte de l'équipe, ou `undefined` si elle n'est pas configurée. */
  get address(): string | undefined {
    return this.config.get<string>('TEAM_NOTIFY_EMAIL') || undefined;
  }

  /** Envoie l'alerte construite par `build` à la boîte de l'équipe (si configurée), sans l'attendre. */
  notify(build: (to: string) => OutgoingMail): void {
    const to = this.address;
    if (!to) return;
    void this.mail.send(build(to)).catch((error: unknown) => {
      // Jamais d'adresse ni de contenu dans les logs : seulement le type d'erreur.
      this.logger.error(
        `Échec d'envoi d'une alerte à l'équipe (${error instanceof Error ? error.name : 'erreur inconnue'})`,
      );
    });
  }
}

/** Fiche du médecin `userId` pour une alerte, ou `null` si ce compte n'est pas un médecin. */
export async function findDoctorSummary(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<DoctorSummary | null> {
  const doctor = await tx.doctorProfile.findUnique({
    where: { userId },
    select: {
      firstName: true,
      lastName: true,
      licenseNumber: true,
      institution: true,
      user: { select: { email: true } },
    },
  });
  if (!doctor) return null;
  const { user, ...details } = doctor;
  return { email: user.email, ...details };
}
