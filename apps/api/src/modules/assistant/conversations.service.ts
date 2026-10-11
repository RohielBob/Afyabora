// Conversations de l'assistant « Afyabora » (L9-05, contrat 0.4.0, ADR-0005 complétée le 2026-10-11).
//
// Règles :
//  - PROPRIÉTÉ : le patient vient TOUJOURS du jeton ; la conversation ou le message d'un autre patient est
//    « introuvable » (404), jamais révélé. Le médecin n'a aucune route ici (rôle PATIENT seulement).
//  - Identifiants créés sur le TÉLÉPHONE (conversation, question) : rejouer un envoi ne crée jamais de
//    doublon (200 au rejeu) ; un identifiant déjà pris par autre chose ⇒ 409.
//  - Textes CHIFFRÉS en base (AES-256-GCM, même clé que les notes) : questions, réponses et début de la
//    première question (aperçu de la liste). Aucun texte dans les journaux.
//  - 20 questions par heure au plus par patient (le modèle local est lent, L9-07) ⇒ 429 + délai.
//  - Effacement RÉEL (pas de corbeille), d'une conversation ou de toutes ; aussi avec le compte (cascade).
// En L9-05, les réponses sont des GABARITS prêts tout de suite (`templateAnswer`) ; les sources (mesures,
// fiches) arrivent en L9-06 et le modèle de langage en L9-07.
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type {
  AssistantConversationDetail,
  AssistantConversationDto,
  AssistantConversationList,
  AssistantListQuery,
  AssistantMessageDto,
  CreateAssistantConversationInput,
  KnowledgeSheetRef,
  SendAssistantMessageInput,
  SendAssistantMessageResponse,
} from '@glyka/shared';
import { decryptOptionalText, encryptField } from '../../common/crypto/field-encryption';
import {
  afterCursor,
  decodeCursor,
  encodeCursor,
  hasPrismaCode,
  notFound as notFoundError,
} from '../../common/data/owned-records';
import { UNAUTHORIZED_MESSAGE } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { templateAnswer } from './answers/template-answer';

/** Questions autorisées par patient sur une heure glissante. */
export const QUESTIONS_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;
/** Longueur maximale de l'aperçu d'une conversation (contrat : AssistantConversation.preview). */
export const PREVIEW_MAX = 80;

const CONVERSATION_SELECT = {
  id: true,
  patientId: true,
  previewEncrypted: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { messages: true } },
} as const;

type ConversationRow = {
  id: string;
  patientId: string;
  previewEncrypted: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { messages: number };
};

type MessageRow = {
  id: string;
  conversationId: string;
  patientId: string;
  role: AssistantMessageDto['role'];
  status: AssistantMessageDto['status'];
  kind: AssistantMessageDto['kind'];
  textEncrypted: string | null;
  sources: unknown;
  rephrased: boolean;
  questionId: string | null;
  createdAt: Date;
};

/** Résultat d'un envoi : `created` faux = rejeu d'une question déjà reçue (200 au lieu de 202). */
export interface SendResult {
  response: SendAssistantMessageResponse;
  created: boolean;
}

/** Aperçu de la liste : début de la première question, coupé proprement à 80 caractères. */
export function previewOf(question: string): string {
  const text = question.replace(/\s+/g, ' ').trim();
  return text.length <= PREVIEW_MAX ? text : `${text.slice(0, PREVIEW_MAX - 1).trimEnd()}…`;
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger('Assistant');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** POST /assistant/conversations : 201 si créée, 200 au rejeu ; identifiant d'un autre patient ⇒ 409. */
  async create(
    patientId: string,
    input: CreateAssistantConversationInput,
  ): Promise<{ conversation: AssistantConversationDto; created: boolean }> {
    const existing = await this.findConversation(input.id);
    if (existing)
      return { conversation: this.replayedConversation(existing, patientId), created: false };
    try {
      const row = await this.prisma.assistantConversation.create({
        data: { id: input.id, patientId },
        select: CONVERSATION_SELECT,
      });
      return { conversation: this.toConversation(row), created: true };
    } catch (error) {
      // Deux envois simultanés : le second relit la conversation du premier.
      if (hasPrismaCode(error, 'P2002')) {
        const winner = await this.findConversation(input.id);
        if (winner)
          return { conversation: this.replayedConversation(winner, patientId), created: false };
      }
      if (hasPrismaCode(error, 'P2003')) throw await this.noProfile(patientId);
      throw error;
    }
  }

  /** GET /assistant/conversations : de la plus récemment modifiée à la plus ancienne, par curseur. */
  async list(patientId: string, query: AssistantListQuery): Promise<AssistantConversationList> {
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.prisma.assistantConversation.findMany({
      where: { patientId, ...(after ? afterCursor('updatedAt', after) : {}) },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: CONVERSATION_SELECT,
    });
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    return {
      items: page.map((row) => this.toConversation(row)),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last.updatedAt, last.id) : null,
    };
  }

  /** GET /assistant/conversations/{id} : la conversation et ses messages, du plus ancien au plus récent. */
  async get(patientId: string, id: string): Promise<AssistantConversationDetail> {
    const row = await this.findConversation(id);
    if (!row || row.patientId !== patientId) throw notFound();
    const messages = await this.prisma.assistantMessage.findMany({
      where: { conversationId: id },
      orderBy: [{ createdAt: 'asc' }, { role: 'asc' }],
    });
    return {
      ...this.toConversation(row),
      messages: (messages as MessageRow[]).map((m) => this.toMessage(m)),
    };
  }

  /** DELETE /assistant/conversations/{id} : effacement réel ; 404 si inconnue, déjà effacée ou d'un autre. */
  async remove(patientId: string, id: string): Promise<void> {
    const { count } = await this.prisma.assistantConversation.deleteMany({
      where: { id, patientId },
    });
    if (count === 0) throw notFound();
  }

  /** DELETE /assistant/conversations : efface TOUTES les conversations du patient (messages compris). */
  async removeAll(patientId: string): Promise<void> {
    await this.prisma.assistantConversation.deleteMany({ where: { patientId } });
  }

  /**
   * POST /assistant/conversations/{id}/messages : enregistre la question et sa réponse.
   * 202 (`created`) à la première réception ; 200 au rejeu exact (même identifiant, même conversation,
   * même texte) ; identifiant déjà pris par une autre question ⇒ 409 MESSAGE_ID_CONFLICT.
   */
  async send(
    patientId: string,
    conversationId: string,
    input: SendAssistantMessageInput,
  ): Promise<SendResult> {
    const replay = await this.replay(patientId, conversationId, input);
    if (replay) return { response: replay, created: false };

    const conversation = await this.findConversation(conversationId);
    if (!conversation || conversation.patientId !== patientId) throw notFound();
    await this.checkQuota(patientId);

    const answer = templateAnswer(input.text);
    const askedAt = new Date();
    const key = this.key();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.assistantMessage.create({
          data: {
            id: input.id,
            conversationId,
            patientId,
            role: 'USER',
            status: 'READY',
            textEncrypted: encryptField(input.text, key),
            createdAt: askedAt,
          },
        });
        await tx.assistantMessage.create({
          data: {
            id: randomUUID(),
            conversationId,
            patientId,
            role: 'ASSISTANT',
            status: 'READY',
            kind: answer.kind,
            textEncrypted: encryptField(answer.text, key),
            sources: answer.sources as unknown as object[],
            rephrased: answer.rephrased,
            questionId: input.id,
            // 1 ms après la question : l'ordre de la conversation ne dépend jamais du hasard.
            createdAt: new Date(askedAt.getTime() + 1),
          },
        });
        await tx.assistantConversation.update({
          where: { id: conversationId },
          data: {
            updatedAt: askedAt,
            ...(conversation.previewEncrypted
              ? {}
              : { previewEncrypted: encryptField(previewOf(input.text), key) }),
          },
        });
      });
    } catch (error) {
      // Même question envoyée deux fois en même temps : la seconde relit la première.
      if (hasPrismaCode(error, 'P2002')) {
        const winner = await this.replay(patientId, conversationId, input);
        if (winner) return { response: winner, created: false };
        throw messageIdConflict();
      }
      // La conversation a été effacée pendant l'envoi.
      if (hasPrismaCode(error, 'P2003') || hasPrismaCode(error, 'P2025')) throw notFound();
      throw error;
    }
    this.logger.log(`Question enregistrée, réponse : ${answer.kind}`); // jamais le texte
    const pair = await this.readPair(input.id);
    if (!pair) throw notFound();
    return { response: pair, created: true };
  }

  // ---------------------------------------------------------------- Interne

  /** Rejeu : la question existe déjà ⇒ son état actuel, ou 409 si l'identifiant sert à autre chose. */
  private async replay(
    patientId: string,
    conversationId: string,
    input: SendAssistantMessageInput,
  ): Promise<SendAssistantMessageResponse | null> {
    const existing = (await this.prisma.assistantMessage.findUnique({
      where: { id: input.id },
    })) as MessageRow | null;
    if (!existing) return null;
    const same =
      existing.role === 'USER' &&
      existing.patientId === patientId &&
      existing.conversationId === conversationId &&
      decryptOptionalText(existing.textEncrypted, this.key()) === input.text;
    if (!same) throw messageIdConflict();
    return this.readPair(input.id);
  }

  private async readPair(questionId: string): Promise<SendAssistantMessageResponse | null> {
    const [question, answer] = (await Promise.all([
      this.prisma.assistantMessage.findUnique({ where: { id: questionId } }),
      this.prisma.assistantMessage.findUnique({ where: { questionId } }),
    ])) as [MessageRow | null, MessageRow | null];
    if (!question || !answer) return null;
    return { question: this.toMessage(question), answer: this.toMessage(answer) };
  }

  /** 429 au-delà de QUESTIONS_PER_HOUR questions sur l'heure écoulée, avec le délai avant la prochaine. */
  private async checkQuota(patientId: string): Promise<void> {
    const since = new Date(Date.now() - HOUR_MS);
    const where = { patientId, role: 'USER' as const, createdAt: { gte: since } };
    const asked = await this.prisma.assistantMessage.count({ where });
    if (asked < QUESTIONS_PER_HOUR) return;
    const oldest = await this.prisma.assistantMessage.findFirst({
      where,
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    const freeAt = (oldest?.createdAt.getTime() ?? Date.now()) + HOUR_MS;
    const retryAfterSeconds = Math.max(1, Math.ceil((freeAt - Date.now()) / 1000));
    throw new HttpException(
      {
        message: `Vous avez posé ${QUESTIONS_PER_HOUR} questions en une heure : réessayez un peu plus tard.`,
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private findConversation(id: string): Promise<ConversationRow | null> {
    return this.prisma.assistantConversation.findUnique({
      where: { id },
      select: CONVERSATION_SELECT,
    });
  }

  /** Rejeu de création : la conversation de CE patient est relue ; celle d'un autre ⇒ 409. */
  private replayedConversation(row: ConversationRow, patientId: string): AssistantConversationDto {
    if (row.patientId !== patientId) {
      throw new ConflictException({
        message: 'Cet identifiant de conversation est déjà utilisé : générez-en un nouveau.',
      });
    }
    return this.toConversation(row);
  }

  private key(): string {
    return this.config.getOrThrow<string>('FIELD_ENCRYPTION_KEY');
  }

  private toConversation(row: ConversationRow): AssistantConversationDto {
    return {
      id: row.id,
      preview:
        decryptOptionalText(row.previewEncrypted, this.key(), () =>
          this.logger.warn('Aperçu de conversation illisible ignoré.'),
        ) ?? '',
      messageCount: row._count.messages,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toMessage(row: MessageRow): AssistantMessageDto {
    return {
      id: row.id,
      conversationId: row.conversationId,
      role: row.role,
      status: row.status,
      kind: row.kind,
      text: decryptOptionalText(row.textEncrypted, this.key(), () =>
        this.logger.warn('Message illisible ignoré.'),
      ),
      sources: Array.isArray(row.sources) ? (row.sources as KnowledgeSheetRef[]) : [],
      rephrased: row.rephrased,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async noProfile(patientId: string): Promise<Error> {
    const user = await this.prisma.user.findUnique({
      where: { id: patientId },
      select: { id: true },
    });
    if (!user) return new UnauthorizedException({ message: UNAUTHORIZED_MESSAGE });
    return new BadRequestException({
      message: 'Complétez votre profil médical avant de discuter avec l’assistant.',
    });
  }
}

function notFound() {
  return notFoundError('Conversation introuvable.');
}

function messageIdConflict() {
  return new ConflictException({
    message: 'Cet identifiant de message est déjà utilisé.',
    statusCode: HttpStatus.CONFLICT,
    code: 'MESSAGE_ID_CONFLICT',
  });
}
