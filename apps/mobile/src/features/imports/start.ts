// Étape 1 de l'import (L4-05, CDC F5) : choix du fichier et de l'unité par défaut. Fonctions PURES
// (testables sans écran) : contrôle du fichier AVANT l'envoi, taille lisible, issue de l'analyse.
//
// L'analyse se fait sur le serveur (POST /imports/preview) : elle demande le réseau. Rien n'est gardé sur
// le téléphone après coup : le fichier reste où il est, seul son contenu est envoyé.
import { IMPORT_MAX_FILE_BYTES, importColumnsErrorSchema, type GlucoseUnit } from '@glyka/shared';
import { ApiError } from '@/lib/api-client';

/** Fichier choisi par le patient (sélecteur de documents). `file` : objet du navigateur (version web). */
export interface PickedFile {
  name: string;
  /** Taille en octets ; null si le téléphone ne la donne pas (le serveur vérifie de toute façon). */
  size: number | null;
  uri: string;
  mimeType?: string;
  file?: Blob;
}

/**
 * Types proposés par le sélecteur : CSV (et ses variantes texte) et Excel. Android donne parfois aux CSV
 * le type « text/comma-separated-values » ou « text/plain ». L'ancien Excel (.xls) reste visible pour
 * expliquer qu'il faut l'enregistrer en .xlsx, au lieu de le cacher sans raison.
 */
export const IMPORT_PICKER_TYPES = [
  'text/csv',
  'text/comma-separated-values',
  'application/csv',
  'text/plain',
  'text/tab-separated-values',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

export type FileKind = 'csv' | 'xlsx';
export type FileProblem = 'empty' | 'tooLarge' | 'oldExcel' | 'unsupported';
export type FileCheck = { ok: true; kind: FileKind } | { ok: false; problem: FileProblem };

/**
 * Contrôle AVANT l'envoi, pour répondre tout de suite (et ne pas envoyer 30 Mo pour rien) : extension
 * (.csv, .txt, .tsv, .xlsx ; .xls = ancien format), fichier vide, plus de 5 Mo. Le serveur refait tous les
 * contrôles : ceci n'est qu'un confort.
 */
export function checkFile(file: Pick<PickedFile, 'name' | 'size'>): FileCheck {
  const extension = /\.([a-z0-9]+)$/i.exec(file.name.trim())?.[1]?.toLowerCase();
  const kind: FileKind | null =
    extension === 'xlsx'
      ? 'xlsx'
      : extension === 'csv' || extension === 'txt' || extension === 'tsv'
        ? 'csv'
        : null;
  if (extension === 'xls') return { ok: false, problem: 'oldExcel' };
  if (!kind) return { ok: false, problem: 'unsupported' };
  if (file.size === 0) return { ok: false, problem: 'empty' };
  if (file.size !== null && file.size > IMPORT_MAX_FILE_BYTES) {
    return { ok: false, problem: 'tooLarge' };
  }
  return { ok: true, kind };
}

/** Taille lisible : « 812 o », « 12 Ko », « 1,2 Mo » (unités 1024, une décimale au-delà du Mo). */
export function fileSize(bytes: number): { amount: number; unit: 'bytes' | 'kb' | 'mb' } {
  if (bytes < 1024) return { amount: bytes, unit: 'bytes' };
  if (bytes < 1024 * 1024) return { amount: Math.round(bytes / 1024), unit: 'kb' };
  return { amount: Math.round((bytes / 1024 / 1024) * 10) / 10, unit: 'mb' };
}

/** Exemple de valeur pour chaque unité, montré sous le choix (« 1,10 », « 110 », « 6,1 »). */
export const UNIT_EXAMPLES: Readonly<Record<GlucoseUnit, number>> = {
  G_L: 1.1,
  MG_DL: 110,
  MMOL_L: 6.1,
};

/**
 * Issue d'un envoi raté, pour l'écran :
 *  - offline : pas de réponse (réseau coupé, serveur injoignable) ;
 *  - tooLarge : 413 (plus de 5 Mo ou de 5 000 lignes) ;
 *  - columns : 400 IMPORT_COLUMNS_NOT_FOUND (contrat 0.4.1) ⇒ choisir les colonnes (L4-06) parmi
 *    `columns`, les noms des colonnes du fichier renvoyés par le serveur ;
 *  - unreadable : 400 sur le fichier (classeur abîmé, ancien .xls, une seule colonne…) ;
 *  - tooMany : 429 (10 analyses par minute) ;
 *  - rejected : autre refus du serveur avec un message (ex. profil médical à compléter) ;
 *  - error : le reste (panne, réponse inattendue).
 * `detail` : le message précis du serveur, quand il en donne un.
 */
export type PreviewProblem =
  | { kind: 'offline' | 'tooLarge' | 'tooMany' | 'error'; detail?: string }
  | { kind: 'columns'; columns: string[]; detail: string }
  | { kind: 'unreadable' | 'rejected'; detail: string };

export function previewProblem(error: unknown): PreviewProblem {
  if (!(error instanceof ApiError)) return { kind: 'error' };
  if (error.status === 0) return { kind: 'offline' };
  if (error.status === 413) return { kind: 'tooLarge', detail: error.message };
  if (error.status === 429) return { kind: 'tooMany' };
  if (error.status === 400 && error.code === 'IMPORT_COLUMNS_NOT_FOUND') {
    // Réponse vérifiée avec le schéma du contrat : sans liste de colonnes lisible, rien à proposer.
    const parsed = importColumnsErrorSchema.safeParse(error.body);
    if (parsed.success) {
      return { kind: 'columns', columns: parsed.data.columns, detail: parsed.data.message };
    }
    return { kind: 'error' };
  }
  if (error.status === 400) {
    const onFile = error.issues.find((issue) => issue.path === 'file');
    if (onFile) return { kind: 'unreadable', detail: onFile.message };
    if (error.issues.length === 0) return { kind: 'rejected', detail: error.message };
  }
  return { kind: 'error' };
}
