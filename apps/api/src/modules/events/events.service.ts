// Événements de vie (ticket L2-02) : repas, activité, traitement DÉCLARÉ par le patient.
//
// Mêmes principes que les mesures (L2-01) :
//  - identifiant (UUID) créé sur le TÉLÉPHONE : rejouer une création ne crée jamais de doublon ;
//  - date plus de 5 minutes dans le futur refusée ; dates rendues en UTC ;
//  - suppression = « tombstone » (`deletedAt`) pour la synchronisation, texte libre effacé tout de suite ;
//  - l'événement d'un autre patient est « introuvable » (404), jamais révélé.
// Traitement : on enregistre ce que le patient DÉCLARE (« Metformine 500 mg, matin »). Aucun calcul de
// dose, aucun conseil, aucune vérification médicale (CDC : jamais de dose ni de diagnostic).
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import type {
  CreateLifeEventInput,
  LifeEventDto,
  ListQuery,
  UpdateLifeEventInput,
} from '@glyka/shared';
import {
  afterCursor,
  decodeCursor,
  encodeCursor,
  hasPrismaCode,
  invalidField,
  notFound as notFoundError,
  notInFuture,
} from '../../common/data/owned-records';
import { UNAUTHORIZED_MESSAGE } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

const SELECT = {
  id: true,
  patientId: true,
  type: true,
  occurredAt: true,
  label: true,
  details: true,
  durationMinutes: true,
  updatedAt: true,
  deletedAt: true,
} as const;

type Row = {
  id: string;
  patientId: string;
  type: LifeEventDto['type'];
  occurredAt: Date;
  label: string;
  details: string | null;
  durationMinutes: number | null;
  updatedAt: Date;
  deletedAt: Date | null;
};

export interface LifeEventList {
  items: LifeEventDto[];
  nextCursor: string | null;
}

export interface CreateResult {
  event: LifeEventDto;
  created: boolean;
}

const FUTURE_MESSAGE = 'La date de l’événement est dans le futur.';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  /** POST /events : 201 si créé, 200 si l'identifiant existe déjà pour ce patient (rejeu). */
  async create(patientId: string, input: CreateLifeEventInput): Promise<CreateResult> {
    const existing = await this.findOwned(input.id, patientId);
    if (existing) return { event: toDto(existing), created: false };

    const now = new Date();
    try {
      const row = await this.prisma.lifeEvent.create({
        data: {
          id: input.id,
          patientId,
          type: input.type,
          occurredAt: notInFuture(input.occurredAt, 'occurredAt', now, FUTURE_MESSAGE),
          label: input.label,
          details: cleanText(input.details),
          durationMinutes: input.durationMinutes ?? null,
          clientUpdatedAt: now,
        },
        select: SELECT,
      });
      return { event: toDto(row), created: true };
    } catch (error) {
      // Deux envois simultanés du même événement : le second relit celui du premier (200).
      if (hasPrismaCode(error, 'P2002')) {
        const winner = await this.findOwned(input.id, patientId);
        if (winner) return { event: toDto(winner), created: false };
        throw invalidField('id', 'Identifiant déjà utilisé : générez-en un nouveau.');
      }
      if (hasPrismaCode(error, 'P2003')) throw await this.noProfile(patientId);
      throw error;
    }
  }

  /** GET /events : période [from ; to[, du plus récent au plus ancien, sans les supprimés, par curseur. */
  async list(patientId: string, query: ListQuery): Promise<LifeEventList> {
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.prisma.lifeEvent.findMany({
      where: {
        patientId,
        deletedAt: null,
        occurredAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lt: new Date(query.to) } : {}),
        },
        ...(after ? afterCursor('occurredAt', after) : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: SELECT,
    });
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    return {
      items: page.map(toDto),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last.occurredAt, last.id) : null,
    };
  }

  /** PUT /events/:id : seuls les champs envoyés changent ; texte libre vide = effacé. */
  async update(patientId: string, id: string, input: UpdateLifeEventInput): Promise<LifeEventDto> {
    const current = await this.findOwned(id, patientId);
    if (!current || current.deletedAt) throw notFound();

    const now = new Date();
    const data: Record<string, unknown> = {};
    if (input.type !== undefined) data.type = input.type;
    if (input.occurredAt !== undefined) {
      data.occurredAt = notInFuture(input.occurredAt, 'occurredAt', now, FUTURE_MESSAGE);
    }
    if (input.label !== undefined) data.label = input.label;
    if (input.details !== undefined) data.details = cleanText(input.details);
    if (input.durationMinutes !== undefined) data.durationMinutes = input.durationMinutes;
    if (Object.keys(data).length === 0) return toDto(current);

    // Condition « non supprimé » dans l'écriture : une suppression simultanée gagne.
    const changed = await this.prisma.lifeEvent.updateMany({
      where: { id, patientId, deletedAt: null },
      data: { ...data, clientUpdatedAt: now },
    });
    if (changed.count === 0) throw notFound();
    const updated = await this.findOwned(id, patientId);
    if (!updated) throw notFound();
    return toDto(updated);
  }

  /** DELETE /events/:id : tombstone, texte libre effacé ; 204 même si déjà supprimé, 404 si inconnu. */
  async remove(patientId: string, id: string): Promise<void> {
    const now = new Date();
    const removed = await this.prisma.lifeEvent.updateMany({
      where: { id, patientId, deletedAt: null },
      data: { deletedAt: now, details: null, clientUpdatedAt: now },
    });
    if (removed.count === 1) return;
    if (!(await this.findOwned(id, patientId))) throw notFound();
  }

  private async findOwned(id: string, patientId: string): Promise<Row | null> {
    const row = await this.prisma.lifeEvent.findUnique({ where: { id }, select: SELECT });
    return row && row.patientId === patientId ? row : null;
  }

  private async noProfile(patientId: string): Promise<Error> {
    const user = await this.prisma.user.findUnique({
      where: { id: patientId },
      select: { id: true },
    });
    if (!user) return new UnauthorizedException({ message: UNAUTHORIZED_MESSAGE });
    return new BadRequestException({
      message: 'Complétez votre profil médical avant d’enregistrer des événements.',
    });
  }
}

function notFound() {
  return notFoundError('Événement introuvable.');
}

/** Texte libre : espaces retirés ; vide = pas de texte. */
function cleanText(text: string | undefined): string | null {
  const value = text?.trim();
  return value ? value : null;
}

function toDto(row: Row): LifeEventDto {
  return {
    id: row.id,
    type: row.type,
    occurredAt: row.occurredAt.toISOString(),
    label: row.label,
    details: row.details,
    durationMinutes: row.durationMinutes,
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}
