// Onglet « Rapport PDF » (L6-04, CDC F9) : la LOGIQUE, sans interface (testée dans
// __tests__/report.test.ts). Le PDF est fabriqué par l'API (GET /doctor/sessions/:id/report, L6-02), qui
// revérifie à CHAQUE téléchargement que l'accès est ouvert et que le patient a coché « Rapport PDF », et
// inscrit le téléchargement dans le journal du patient.
//  - période 14 / 30 / 90 jours (liste de @glyka/shared, comme la validation du serveur) ;
//  - nom du fichier : même format que le serveur, sans le nom du patient (le navigateur ne laisse pas
//    lire l'en-tête Content-Disposition d'une autre adresse) ;
//  - le fichier n'est gardé nulle part : l'adresse temporaire du navigateur est libérée juste après ;
//  - fin d'accès pendant le téléchargement : même réaction que le reste du dossier (recordProblem).
import { REPORT_PERIOD_DAYS } from '@glyka/shared';
import { apiFile, ApiError } from '@/lib/api-client';
import { recordProblem, type EndReason } from './view';

export const REPORT_PERIODS = REPORT_PERIOD_DAYS;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];
export const DEFAULT_REPORT_PERIOD: ReportPeriod = 30;

/** GET /doctor/sessions/:id/report?period=30 */
export function reportPath(sessionId: string, days: ReportPeriod): string {
  return `/doctor/sessions/${encodeURIComponent(sessionId)}/report?period=${days}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `afyabora-rapport-2026-10-19-30j.pdf` : date du jour (ordinateur du médecin), jamais le nom du patient. */
export function reportFilename(days: ReportPeriod, now: Date): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `afyabora-rapport-${date}-${days}j.pdf`;
}

/** Un PDF commence toujours par « %PDF- » : sinon la réponse n'est pas un rapport. */
export function isPdf(bytes: Uint8Array): boolean {
  const magic = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  return bytes.length > magic.length && magic.every((byte, i) => bytes[i] === byte);
}

/** Pourquoi le rapport n'a pas été téléchargé (l'onglet traduit chaque cas). */
export type ReportProblem =
  | { kind: 'ended'; reason: EndReason } // accès terminé : tout le dossier est effacé
  | { kind: 'notShared' } // le patient a retiré « Rapport PDF » (ne devrait pas arriver : onglet caché)
  | { kind: 'tooMany' }
  | { kind: 'network' }
  | { kind: 'server' };

export function reportProblem(error: unknown): ReportProblem {
  if (error instanceof ApiError) {
    if (error.status === 429) return { kind: 'tooMany' };
    if (error.code === 'CATEGORY_NOT_SHARED') return { kind: 'notShared' };
  }
  const problem = recordProblem(error);
  return problem.kind === 'ended' ? problem : { kind: problem.kind };
}

/** Ce dont le téléchargement a besoin (remplacé dans les tests). */
export interface ReportDeps {
  fetchPdf: (path: string) => Promise<Uint8Array>;
  /** Propose le fichier au navigateur (« Enregistrer »). */
  save: (bytes: Uint8Array, filename: string) => void;
  now: () => Date;
}

export type ReportOutcome =
  { ok: true; filename: string; at: Date } | { ok: false; problem: ReportProblem };

/** Télécharge le rapport de ce partage et le propose au navigateur. */
export async function downloadReport(
  sessionId: string,
  days: ReportPeriod,
  deps: ReportDeps,
): Promise<ReportOutcome> {
  let bytes: Uint8Array;
  try {
    bytes = await deps.fetchPdf(reportPath(sessionId, days));
  } catch (error) {
    return { ok: false, problem: reportProblem(error) };
  }
  if (!isPdf(bytes)) return { ok: false, problem: { kind: 'server' } };
  const at = deps.now();
  const filename = reportFilename(days, at);
  deps.save(bytes, filename);
  return { ok: true, filename, at };
}

/**
 * Le navigateur enregistre le fichier (lien `download` temporaire). L'adresse `blob:` est libérée tout
 * de suite après : le PDF ne reste pas dans la mémoire de la page.
 */
export function saveInBrowser(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Laisser au navigateur le temps de commencer l'enregistrement, puis libérer.
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}

export const browserDeps: ReportDeps = {
  fetchPdf: apiFile,
  save: saveInBrowser,
  now: () => new Date(),
};
