// Mes données et mon compte (L1-14, CDC F1, RGPD) : la LOGIQUE, sans téléphone ni réseau (testée dans
// __tests__/account.test.ts). Le branchement est dans useAccountExport.ts et features/auth/session.ts.
//
//  - EXPORTER : GET /me/export renvoie un fichier JSON (profil, mesures, événements, notes déchiffrées).
//    Les saisies pas encore envoyées partent d'abord (sinon elles manqueraient) ; celles qui n'ont pas pu
//    partir sont annoncées.
//  - SUPPRIMER : DELETE /me avec le mot de passe ; le serveur efface TOUT (partages compris : un médecin
//    perd l'accès tout de suite), puis le téléphone efface ses données et ferme la session.
import { ApiError, type ApiFile } from '@/lib/api-client';

export const EXPORT_PATH = '/me/export';
export const EXPORT_TIMEOUT_MS = 60_000;

/** Nom proposé par le serveur s'il est sûr (lettres, chiffres, - _ . et .json), sinon un nom local daté. */
const SAFE_NAME = /^[A-Za-z0-9._-]{1,80}\.json$/;

export function exportFilename(contentDisposition: string | null, now: Date): string {
  const proposed = /filename="?([^";]+)"?/i.exec(contentDisposition ?? '')?.[1]?.trim();
  if (proposed && SAFE_NAME.test(proposed) && !proposed.includes('..')) return proposed;
  return `afyabora-export-${now.toISOString().slice(0, 10)}.json`;
}

/** Un export valide est un objet JSON avec au moins `exportedAt` (sinon la réponse n'est pas un export). */
export function isExport(bytes: Uint8Array): boolean {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { exportedAt?: unknown }).exportedAt === 'string'
    );
  } catch {
    return false;
  }
}

/** Pourquoi l'export n'a pas abouti (l'écran traduit chaque cas). */
export type ExportProblem = 'offline' | 'tooMany' | 'noProfile' | 'cannotShare' | 'error';

export function exportProblem(error: unknown): ExportProblem {
  if (!(error instanceof ApiError)) return 'error';
  if (error.status === 0) return 'offline';
  if (error.status === 429) return 'tooMany';
  if (error.status === 404) return 'noProfile'; // profil médical pas encore créé
  return 'error';
}

/** Étape en cours, affichée sur le bouton. */
export type ExportPhase = 'syncing' | 'downloading' | 'sharing';

export interface ExportDeps<Saved> {
  isOnline: () => Promise<boolean>;
  /** Données du téléphone pas encore envoyées, maintenant. */
  pending: () => number;
  /** Envoie tout de suite et renvoie ce qui reste à envoyer ensuite. */
  syncNow: () => Promise<{ pendingCount: number }>;
  download: () => Promise<ApiFile>;
  save: (bytes: Uint8Array, filename: string) => Promise<Saved>;
  /** Ouvre le partage du système ; false s'il n'existe pas sur cet appareil. */
  share: (saved: Saved) => Promise<boolean>;
  now: () => Date;
}

export type ExportOutcome<Saved> =
  | { ok: true; saved: Saved; filename: string; unsent: number }
  | { ok: false; problem: ExportProblem; saved?: Saved; filename?: string; unsent?: number };

/**
 * Exporter mes données puis ouvrir le partage :
 *  1. sans réseau ⇒ on le dit tout de suite ;
 *  2. saisies en attente ⇒ envoyées d'abord ;
 *  3. le serveur prépare le fichier ; une réponse qui n'est pas un export est une erreur ;
 *  4. le fichier est rangé, puis le partage du système s'ouvre (Fichiers, Drive, e-mail…).
 */
export async function exportMyData<Saved>(
  deps: ExportDeps<Saved>,
  onPhase: (phase: ExportPhase) => void = () => undefined,
): Promise<ExportOutcome<Saved>> {
  if (!(await deps.isOnline())) return { ok: false, problem: 'offline' };

  let unsent = 0;
  if (deps.pending() > 0) {
    onPhase('syncing');
    // Envoi impossible (serveur occupé…) : on exporte quand même, et on dit ce qui manque.
    unsent = await deps
      .syncNow()
      .then((state) => state.pendingCount)
      .catch(() => deps.pending());
  }

  onPhase('downloading');
  let file: ApiFile;
  try {
    file = await deps.download();
  } catch (error) {
    return { ok: false, problem: exportProblem(error), unsent };
  }
  if (!isExport(file.bytes)) return { ok: false, problem: 'error', unsent };

  const filename = exportFilename(file.headers.get('content-disposition'), deps.now());
  const saved = await deps.save(file.bytes, filename);
  onPhase('sharing');
  const shared = await deps.share(saved).catch(() => false);
  if (!shared) return { ok: false, problem: 'cannotShare', saved, filename, unsent };
  return { ok: true, saved, filename, unsent };
}

/** Pourquoi la suppression n'a pas abouti (rien n'a été supprimé). */
export type DeleteProblem = 'password' | 'tooMany' | 'offline' | 'error';

export function deleteProblem(error: unknown): DeleteProblem {
  if (!(error instanceof ApiError)) return 'error';
  if (error.status === 403 && error.code === 'INVALID_PASSWORD') return 'password';
  if (error.status === 429) return 'tooMany';
  if (error.status === 0) return 'offline';
  return 'error';
}

/** Le bouton « Supprimer définitivement » n'est actif qu'avec le mot de passe ET la case cochée. */
export function canConfirmDeletion(password: string, understood: boolean): boolean {
  return understood && password.length > 0;
}
