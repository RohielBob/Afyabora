// Appels /imports/* (contrat docs/api/openapi.v0.json, L4-04). La réponse est vérifiée avec le schéma de
// @glyka/shared : une réponse inattendue devient une erreur, jamais un rapport faux.
import {
  importCommitResponseSchema,
  importReportSchema,
  importRevertResponseSchema,
  type GlucoseUnit,
  type ImportColumnMapping,
  type ImportCommitResponse,
  type ImportDecision,
  type ImportReport,
  type ImportRevertResponse,
} from '@glyka/shared';
import { api } from '@/lib/api-client';
import type { PickedFile } from './start';

/** Envoyer et analyser 5 Mo peut prendre du temps sur une connexion lente : 60 s au lieu de 15. */
export const PREVIEW_TIMEOUT_MS = 60_000;

/** Ce qu'il faut d'un formulaire multipart (FormData, ou un faux dans les tests). */
export interface FormLike {
  append(name: string, value: string | Blob, fileName?: string): void;
}

/**
 * Formulaire de POST /imports/preview : `defaultUnit`, `mapping` (JSON, facultatif), puis `file`.
 * Navigateur : le vrai fichier (`Blob`). Téléphone : React Native envoie le fichier désigné par son
 * adresse locale (`{ uri, name, type }`), sans le charger en mémoire.
 */
export function buildPreviewForm<F extends FormLike>(
  form: F,
  file: PickedFile,
  defaultUnit: GlucoseUnit,
  mapping?: ImportColumnMapping,
): F {
  form.append('defaultUnit', defaultUnit);
  if (mapping) form.append('mapping', JSON.stringify(mapping));
  if (file.file) {
    form.append('file', file.file, file.name);
  } else {
    const native = {
      uri: file.uri,
      name: file.name,
      type: file.mimeType ?? 'application/octet-stream',
    };
    form.append('file', native as unknown as Blob);
  }
  return form;
}

export const importsApi = {
  /** Analyse le fichier : rapport (lot « aperçu »), rien n'est encore importé. */
  preview: async (
    file: PickedFile,
    defaultUnit: GlucoseUnit,
    mapping?: ImportColumnMapping,
  ): Promise<ImportReport> =>
    importReportSchema.parse(
      await api('/imports/preview', {
        method: 'POST',
        body: buildPreviewForm(new FormData(), file, defaultUnit, mapping),
        timeoutMs: PREVIEW_TIMEOUT_MS,
      }),
    ),
  /** Importe le lot avec les décisions du patient (une seule fois : 409 ensuite). */
  commit: async (batchId: string, decisions: ImportDecision[]): Promise<ImportCommitResponse> =>
    importCommitResponseSchema.parse(
      await api(`/imports/${batchId}/commit`, {
        method: 'POST',
        body: { decisions },
        timeoutMs: PREVIEW_TIMEOUT_MS,
      }),
    ),
  /** Annule le lot : toutes ses mesures sont retirées (0 s'il l'était déjà). */
  revert: async (batchId: string): Promise<ImportRevertResponse> =>
    importRevertResponseSchema.parse(await api(`/imports/${batchId}`, { method: 'DELETE' })),
};
