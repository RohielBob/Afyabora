// Rapport « Préparer ma consultation » (L6-03, CDC F9) : la LOGIQUE, sans interface ni fichier (testée dans
// __tests__/report.test.ts). Le PDF est fabriqué par l'API (L6-01, L6-02) : les chiffres sont ceux du
// serveur, calculés par le même moteur que l'écran « Analyse » du téléphone.
//
//  - période 14 / 30 / 90 jours (la liste vient de @glyka/shared, comme la validation du serveur) ;
//  - nom du fichier : celui du serveur (Content-Disposition) s'il est sûr, sinon le même format calculé
//    ici (le navigateur ne laisse pas lire cet en-tête). Jamais le nom du patient ;
//  - avant de demander le rapport : les mesures pas encore envoyées partent d'abord, sinon elles
//    manqueraient dans le PDF ; celles qui n'ont pas pu partir sont annoncées au patient ;
//  - chaque échec devient un « problème » expliqué simplement à l'écran.
import { REPORT_PERIOD_DAYS } from '@glyka/shared';
import { ApiError, type ApiFile } from '@/lib/api-client';

export const REPORT_PERIODS = REPORT_PERIOD_DAYS;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];
/** 30 jours à l'ouverture, comme le tableau de bord, l'analyse et le serveur. */
export const DEFAULT_REPORT_PERIOD: ReportPeriod = 30;
/** 90 jours sur une connexion lente : le serveur répond en moins d'une seconde, le réseau peut traîner. */
export const REPORT_TIMEOUT_MS = 60_000;

/** GET /reports/consultation (L6-02). */
export function reportPath(days: ReportPeriod): string {
  return `/reports/consultation?period=${days}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Même format que le serveur : `afyabora-rapport-2026-10-19-30j.pdf` (date du jour, heure du téléphone). */
export function localFilename(days: ReportPeriod, now: Date): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `afyabora-rapport-${date}-${days}j.pdf`;
}

/** Un nom de fichier sans chemin ni caractère spécial, qui finit par .pdf. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.pdf$/;

/**
 * Nom à donner au fichier : celui proposé par le serveur (`attachment; filename="…"`) s'il est sûr, sinon
 * le nom calculé sur le téléphone. Un nom venu du réseau n'est jamais utilisé tel quel comme chemin.
 */
export function filenameOf(
  contentDisposition: string | null,
  days: ReportPeriod,
  now: Date,
): string {
  const proposed = /filename="?([^";]+)"?/i.exec(contentDisposition ?? '')?.[1]?.trim();
  return proposed && SAFE_NAME.test(proposed) && !proposed.includes('..')
    ? proposed
    : localFilename(days, now);
}

/** Un PDF commence toujours par « %PDF- » : sinon la réponse n'est pas un rapport. */
export function isPdf(bytes: Uint8Array): boolean {
  const magic = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  return bytes.length > magic.length && magic.every((byte, i) => bytes[i] === byte);
}

/** Pourquoi le rapport n'a pas pu être créé ou partagé (l'écran traduit chaque cas). */
export type ReportProblem =
  | { kind: 'offline' }
  | { kind: 'tooMany' }
  | { kind: 'noProfile' }
  | { kind: 'cannotShare' }
  | { kind: 'error' };

/** Erreur de l'API ⇒ problème à expliquer. */
export function reportProblem(error: unknown): ReportProblem {
  if (!(error instanceof ApiError)) return { kind: 'error' };
  if (error.status === 0) return { kind: 'offline' };
  if (error.status === 429) return { kind: 'tooMany' };
  if (error.status === 404) return { kind: 'noProfile' }; // profil médical pas encore créé
  return { kind: 'error' };
}

/** Étape en cours, affichée sur le bouton. */
export type ReportPhase = 'syncing' | 'creating' | 'sharing';

/** Ce dont la création a besoin (remplacé dans les tests). */
export interface ReportDeps<Saved> {
  isOnline: () => Promise<boolean>;
  /** Mesures du téléphone pas encore envoyées, maintenant. */
  pendingMeasurements: () => number;
  /** Envoie tout de suite et renvoie ce qui reste à envoyer ensuite. */
  syncNow: () => Promise<{ pendingMeasurements: number }>;
  download: (days: ReportPeriod) => Promise<ApiFile>;
  /** Range le PDF sur le téléphone (ou le prépare dans le navigateur). */
  save: (bytes: Uint8Array, filename: string) => Promise<Saved>;
  /** Ouvre le partage du système ; false si le partage n'existe pas sur cet appareil. */
  share: (saved: Saved) => Promise<boolean>;
  now: () => Date;
}

export type ReportOutcome<Saved> =
  | { ok: true; saved: Saved; filename: string; unsent: number }
  | { ok: false; problem: ReportProblem; saved?: Saved; filename?: string; unsent?: number };

/**
 * Créer le rapport puis ouvrir le partage :
 *  1. sans réseau ⇒ on le dit tout de suite, rien n'est demandé ;
 *  2. mesures en attente ⇒ elles sont envoyées d'abord (sinon le PDF ne les contiendrait pas) ;
 *  3. le serveur fabrique le PDF ; une réponse qui n'est pas un PDF est une erreur ;
 *  4. le fichier est rangé, puis le partage du système s'ouvre (WhatsApp, e-mail, Fichiers…).
 */
export async function createReport<Saved>(
  days: ReportPeriod,
  deps: ReportDeps<Saved>,
  onPhase: (phase: ReportPhase) => void = () => undefined,
): Promise<ReportOutcome<Saved>> {
  if (!(await deps.isOnline())) return { ok: false, problem: { kind: 'offline' } };

  let unsent = 0;
  if (deps.pendingMeasurements() > 0) {
    onPhase('syncing');
    // Envoi impossible (serveur occupé…) : on crée quand même le rapport, et on dit ce qui manque.
    unsent = await deps
      .syncNow()
      .then((state) => state.pendingMeasurements)
      .catch(() => deps.pendingMeasurements());
  }

  onPhase('creating');
  let file: ApiFile;
  try {
    file = await deps.download(days);
  } catch (error) {
    return { ok: false, problem: reportProblem(error), unsent };
  }
  if (!isPdf(file.bytes)) return { ok: false, problem: { kind: 'error' }, unsent };

  const filename = filenameOf(file.headers.get('content-disposition'), days, deps.now());
  let saved: Saved;
  try {
    saved = await deps.save(file.bytes, filename);
  } catch {
    return { ok: false, problem: { kind: 'error' }, unsent };
  }

  onPhase('sharing');
  const shared = await deps.share(saved).catch(() => false);
  if (!shared) return { ok: false, problem: { kind: 'cannotShare' }, saved, filename, unsent };
  return { ok: true, saved, filename, unsent };
}
