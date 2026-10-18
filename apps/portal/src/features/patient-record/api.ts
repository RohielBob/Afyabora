// Dossier partagé (L5-12) : GET /doctor/sessions/:id/summary, /measurements, /timeline. Chaque réponse est
// vérifiée avec le schéma de @glyka/shared : une réponse inattendue devient une erreur, jamais un dossier
// faux. Le serveur revérifie l'accès et filtre les catégories à CHAQUE requête.
import {
  doctorSummarySchema,
  measurementListSchema,
  timelineListSchema,
  type DoctorSummary,
  type MeasurementDto,
  type TimelineItem,
} from '@glyka/shared';
import { api } from '@/lib/api-client';

/** Taille d'une page (maximum du contrat) et nombre de pages lues au plus pour une période. */
export const PAGE_SIZE = 2000;
export const MAX_PAGES = 3;

/** Une liste lue page après page ; `truncated` : il en restait (seules les plus récentes sont gardées). */
export interface Collected<T> {
  items: T[];
  truncated: boolean;
}

/** Lit les pages d'une liste par curseur, jusqu'à la fin ou `MAX_PAGES` pages. */
export async function collect<T>(
  fetchPage: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>,
): Promise<Collected<T>> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await fetchPage(cursor);
    items.push(...result.items);
    cursor = result.nextCursor;
    if (!cursor) return { items, truncated: false };
  }
  return { items, truncated: true };
}

const base = (sessionId: string) => `/doctor/sessions/${encodeURIComponent(sessionId)}`;

const listPath = (path: string, from: string, cursor: string | null) => {
  const params = new URLSearchParams({ from, limit: String(PAGE_SIZE) });
  if (cursor) params.set('cursor', cursor);
  return `${path}?${params.toString()}`;
};

export const recordApi = {
  summary: async (sessionId: string): Promise<DoctorSummary> =>
    doctorSummarySchema.parse(await api(`${base(sessionId)}/summary`)),

  /** Mesures depuis `from` (ISO), de la plus récente à la plus ancienne. */
  measurements: (sessionId: string, from: string): Promise<Collected<MeasurementDto>> =>
    collect(async (cursor) =>
      measurementListSchema.parse(
        await api(listPath(`${base(sessionId)}/measurements`, from, cursor)),
      ),
    ),

  /** Chronologie depuis `from` (ISO) : catégories partagées seulement, la plus récente d'abord. */
  timeline: (sessionId: string, from: string): Promise<Collected<TimelineItem>> =>
    collect(async (cursor) =>
      timelineListSchema.parse(await api(listPath(`${base(sessionId)}/timeline`, from, cursor))),
    ),
};
