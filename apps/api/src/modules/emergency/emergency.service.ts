// Carte d'urgence (L6-05, CDC F10) : la carte du patient, son QR stable, et la page publique limitée.
//  - Le patient choisit CHAQUE champ ; un champ vide n'est jamais montré. Jamais d'historique glycémique.
//  - Le QR ne marche que si la carte est ACTIVÉE et qu'un jeton a été généré. Désactiver la carte (PUT
//    enabled: false) ou régénérer le QR rend l'ancien QR inopérant IMMÉDIATEMENT : la page publique relit
//    la carte en base à chaque ouverture.
//  - Chaque ouverture de la page publique écrit une ligne EMERGENCY_VIEWED au journal du patient (sans
//    médecin : l'accès est anonyme) et met une notification dans la file d'envoi, au plus une toutes les
//    5 minutes. Les deux, sous verrou de la carte : un arrêt au même instant passe avant ou après, jamais
//    « entre », et deux ouvertures simultanées n'envoient pas deux notifications.
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  EmergencyCardInput,
  EmergencyCardPublic,
  EmergencyCardResponse,
  EmergencyQrResponse,
} from '@glyka/shared';
import type { EmergencyCard } from '@prisma/client';
import { notFound } from '../../common/data/owned-records';
import { PrismaService } from '../../prisma/prisma.service';
import { writeAccessLog } from '../audit/access-log';
import { NotificationsService } from '../notifications/notifications.service';
import { busyAsUnavailable, CREATE_TRANSACTION } from '../sharing/sharing.service';
import {
  cardColumns,
  cardResponse,
  EMERGENCY_NOTIFICATION,
  EMERGENCY_NOTIFY_WINDOW_MS,
  emergencyUrl,
  hashEmergencyToken,
  isWellFormedEmergencyToken,
  issueEmergencyToken,
  publicCard,
} from './emergency-card';

export const PROFILE_MISSING_MESSAGE =
  'Profil introuvable : terminez votre inscription pour préparer votre carte d’urgence.';
/** Même réponse pour un jeton inconnu, remplacé ou une carte désactivée : on n'en dit pas plus. */
export const CARD_UNAVAILABLE_MESSAGE = 'Carte d’urgence introuvable ou désactivée.';

@Injectable()
export class EmergencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  /** La carte du patient ; créée vide (désactivée) à la première lecture. */
  async get(patientId: string): Promise<EmergencyCardResponse> {
    await this.requireProfile(patientId);
    const card = await this.prisma.emergencyCard.upsert({
      where: { patientId },
      create: { patientId },
      update: {},
    });
    return cardResponse(card);
  }

  /** Enregistre la carte telle que le patient l'a remplie (un champ absent ou vide est effacé). */
  async save(patientId: string, input: EmergencyCardInput): Promise<EmergencyCardResponse> {
    await this.requireProfile(patientId);
    const columns = cardColumns(input);
    const card = await this.prisma.emergencyCard.upsert({
      where: { patientId },
      create: { patientId, ...columns },
      update: columns,
    });
    return cardResponse(card);
  }

  /**
   * Nouveau QR : le jeton n'est renvoyé qu'ici (l'application le garde), seul son hash est enregistré.
   * L'ancien QR ne marche plus dès cet instant. L'état « activé » de la carte ne change pas.
   */
  async regenerate(patientId: string): Promise<EmergencyQrResponse> {
    await this.requireProfile(patientId);
    const { token, tokenHash } = issueEmergencyToken();
    await this.prisma.emergencyCard.upsert({
      where: { patientId },
      create: { patientId, tokenHash },
      update: { tokenHash },
    });
    return { token, url: emergencyUrl(this.portalUrl(), token) };
  }

  /** Page publique : la carte d'un QR valide et activé, journalisée et notifiée. Sinon 404. */
  async readPublic(
    token: string,
    ip?: string | null,
    now = new Date(),
  ): Promise<EmergencyCardPublic> {
    // Un texte qui n'a pas la forme d'un jeton n'est même pas cherché en base.
    if (!isWellFormedEmergencyToken(token)) throw notFound(CARD_UNAVAILABLE_MESSAGE);
    const tokenHash = hashEmergencyToken(token);
    return this.prisma
      .$transaction(async (tx) => {
        // Verrou sur la carte : relue ACTIVÉE au moment même de la lecture (un arrêt passe avant ou après).
        const [locked] = await tx.$queryRaw<{ patientId: string }[]>`
        SELECT "patientId" FROM "EmergencyCard"
        WHERE "tokenHash" = ${tokenHash} AND "enabled" = true FOR UPDATE`;
        if (!locked) throw notFound(CARD_UNAVAILABLE_MESSAGE);
        const card = (await tx.emergencyCard.findUnique({
          where: { patientId: locked.patientId },
        })) as EmergencyCard;
        const recent = await tx.accessLog.findFirst({
          where: {
            patientId: card.patientId,
            action: 'EMERGENCY_VIEWED',
            at: { gt: new Date(now.getTime() - EMERGENCY_NOTIFY_WINDOW_MS) },
          },
          select: { id: true },
        });
        await writeAccessLog(tx, [
          { patientId: card.patientId, action: 'EMERGENCY_VIEWED', at: now, ip: ip ?? null },
        ]);
        if (!recent) {
          await this.notifications.enqueue(
            card.patientId,
            {
              category: EMERGENCY_NOTIFICATION.category,
              title: EMERGENCY_NOTIFICATION.title,
              body: EMERGENCY_NOTIFICATION.body,
              data: { ...EMERGENCY_NOTIFICATION.data },
            },
            tx,
          );
        }
        return publicCard(card);
      }, CREATE_TRANSACTION) // plusieurs secouristes à la fois : attendre la connexion (10 s), pas 2 s
      .catch(busyAsUnavailable); // base saturée : 503 « réessayez », jamais une erreur 500
  }

  private portalUrl(): string {
    return this.config.get<string>('PORTAL_URL') ?? 'http://localhost:5173';
  }

  /** La carte appartient au profil médical : sans profil, rien à préparer (404, comme le rapport). */
  private async requireProfile(patientId: string): Promise<void> {
    const profile = await this.prisma.patientProfile.findUnique({
      where: { userId: patientId },
      select: { userId: true },
    });
    if (!profile) throw notFound(PROFILE_MISSING_MESSAGE);
  }
}
