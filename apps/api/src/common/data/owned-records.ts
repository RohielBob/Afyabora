// Outils communs aux données du patient créées sur le téléphone (mesures L2-01, événements L2-02) :
// pagination par curseur, date dans le futur, identifiant d'URL, erreurs Prisma.
import { BadRequestException, NotFoundException, ParseUUIDPipe } from '@nestjs/common';

/** Tolérance sur l'heure du téléphone, souvent légèrement en avance. */
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/** Erreur 400 au format du projet (même forme que ZodValidationPipe). */
export function invalidField(path: string, message: string): BadRequestException {
  return new BadRequestException({ message: 'Données invalides', issues: [{ path, message }] });
}

/** Date ISO avec fuseau → Date ; refusée (400 sur `field`) si plus de 5 minutes dans le futur. */
export function notInFuture(iso: string, field: string, now: Date, message: string): Date {
  const date = new Date(iso);
  if (date.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) throw invalidField(field, message);
  return date;
}

/** « Introuvable » : aussi pour la donnée d'un AUTRE patient (on ne révèle jamais qu'elle existe). */
export function notFound(message: string): NotFoundException {
  return new NotFoundException({ message });
}

/** Identifiant dans l'URL : un UUID, sinon 400 au format du projet. */
export function uuidParam(): ParseUUIDPipe {
  return new ParseUUIDPipe({ exceptionFactory: () => invalidField('id', 'Identifiant invalide.') });
}

// ---------- Pagination par curseur ----------
// Curseur opaque : date + identifiant du dernier élément de la page, en base64url. Tri décroissant par
// date PUIS par identifiant : deux éléments à la même heure ne sont ni répétés ni oubliés entre deux pages.

export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify([at.toISOString(), id])).toString('base64url');
}

export function decodeCursor(cursor: string): { at: Date; id: string } {
  try {
    const [iso, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown[];
    const at = new Date(String(iso));
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) || Number.isNaN(at.getTime())) {
      throw new Error('curseur');
    }
    return { at, id };
  } catch {
    throw invalidField('cursor', 'Curseur invalide : recommencez depuis la première page.');
  }
}

/**
 * Condition Prisma « strictement après le curseur » pour un tri (date desc, id desc).
 * `field` : nom de la colonne de date (`measuredAt`, `occurredAt`…).
 */
export function afterCursor(field: string, cursor: { at: Date; id: string }) {
  return {
    OR: [{ [field]: { lt: cursor.at } }, { [field]: cursor.at, id: { lt: cursor.id } }],
  };
}

// ---------- Erreurs Prisma ----------

/**
 * P2002 = valeur unique déjà prise ; P2003 = clé étrangère absente ; P2025 = ligne introuvable ;
 * P2028 = transaction impossible à démarrer ou trop longue (base saturée).
 */
export function hasPrismaCode(
  error: unknown,
  code: 'P2002' | 'P2003' | 'P2025' | 'P2028',
): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

// ---------- Synchronisation (L8-04) ----------

/**
 * Issue d'une opération de synchronisation appliquée par le service d'une entité (mesures, événements) :
 *  - APPLIED : écrite (ou déjà dans cet état) ;
 *  - CONFLICT_SERVER_WINS : la version du serveur est plus récente (« la dernière écriture gagne »), ou la
 *    donnée a déjà été supprimée (une suppression est définitive) ;
 *  - NOT_OWNED : l'identifiant appartient à un AUTRE patient (refus neutre, rien n'est révélé).
 * Une donnée invalide lève l'erreur habituelle (400, 422) : la synchronisation en fait un REJECTED.
 */
export type SyncOutcome = 'APPLIED' | 'CONFLICT_SERVER_WINS' | 'NOT_OWNED';

/**
 * Position dans le flux des changements (GET /sync/pull, L8-05) : ordre croissant (`updatedAt`, `id`).
 *  - `id` renseigné : strictement APRÈS cette ligne (pagination sans perte ni répétition, même avec
 *    beaucoup de lignes à la même milliseconde) ;
 *  - `id` null : tout ce qui a `updatedAt` ≥ `at` (marge de relecture en fin de synchronisation).
 */
export interface SyncPosition {
  at: Date;
  id: string | null;
}

/** Condition Prisma « après la position » (rien si première synchronisation). */
export function afterSyncPosition(position: SyncPosition | null) {
  if (!position) return {};
  if (position.id === null) return { updatedAt: { gte: position.at } };
  return {
    OR: [{ updatedAt: { gt: position.at } }, { updatedAt: position.at, id: { gt: position.id } }],
  };
}
