import { Injectable } from '@nestjs/common';
import type { NotificationCategory } from '@glyka/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Une notification à envoyer : JAMAIS de valeur de santé dans le titre ni le texte (écran verrouillé). */
export interface OutgoingNotification {
  category: NotificationCategory;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Met une notification dans la file d'envoi (`NotificationOutbox`, statut PENDING). L'envoi (Expo Push),
   * les préférences et les heures calmes sont appliqués par la tâche d'envoi (L8-14, L8-16).
   * `client` : la transaction de l'évènement (ex. ouverture de la carte d'urgence, L6-05), pour que
   * l'évènement et sa notification soient enregistrés ensemble ou pas du tout.
   */
  async enqueue(
    userId: string,
    notification: OutgoingNotification,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await client.notificationOutbox.create({
      data: {
        userId,
        category: notification.category,
        title: notification.title,
        body: notification.body,
        ...(notification.data === undefined ? {} : { data: notification.data }),
      },
    });
  }

  // TODO(L8-14, L8-16) : envoi de la file (Expo Push), préférences, heures calmes (voir README.md).
}
