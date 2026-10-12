import { z } from 'zod';
import { GLUCOSE_UNITS } from '../enums';

export const importColumnMappingSchema = z.object({
  date: z.string(),
  time: z.string().optional(),
  value: z.string(),
  unit: z.string().optional(),
  context: z.string().optional(),
});

export const importPreviewRequestSchema = z.object({
  defaultUnit: z.enum(GLUCOSE_UNITS),
  mapping: importColumnMappingSchema.optional(), // absent = détection automatique
});

/**
 * POST /imports/preview est un envoi multipart/form-data : les champs texte arrivent en chaînes.
 * `mapping` y est donc un JSON sérialisé, que ce schéma décode et valide.
 */
export const importPreviewFormSchema = z.object({
  defaultUnit: z.enum(GLUCOSE_UNITS),
  mapping: z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (raw === undefined || raw.trim() === '') return undefined;
      try {
        return importColumnMappingSchema.parse(JSON.parse(raw));
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'mapping doit être un JSON valide de correspondance de colonnes',
        });
        return z.NEVER;
      }
    }),
});

export const IMPORT_ROW_STATUSES = ['VALID', 'DUPLICATE', 'INCONSISTENT', 'ERROR'] as const;
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

export interface ImportRowReport {
  line: number;
  status: ImportRowStatus;
  rawValue: string;
  message?: string; // ex. « Valeur inhabituelle, vérifier l'unité »
}

export interface ImportReport {
  batchId: string;
  analyzed: number;
  valid: number;
  duplicates: number;
  inconsistent: number;
  errors: number;
  rows: ImportRowReport[]; // seules les lignes non valides sont détaillées
}

/**
 * Réponse 400 `IMPORT_COLUMNS_NOT_FOUND` de POST /imports/preview (contrat 0.4.1) : colonnes de date ou de
 * valeur introuvables, ou `mapping` qui cite une colonne absente. `columns` = noms des colonnes du fichier
 * (dans l'ordre, sans les colonnes sans nom) : l'application les fait choisir au patient (L4-06), puis
 * relance l'aperçu avec `mapping`.
 */
export const importColumnsErrorSchema = z.object({
  message: z.string(),
  code: z.literal('IMPORT_COLUMNS_NOT_FOUND'),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  columns: z.array(z.string()),
});
export type ImportColumnsError = z.infer<typeof importColumnsErrorSchema>;

const importDecisionSchema = z
  .object({
    line: z.number().int().positive(),
    action: z.enum(['CORRECT', 'IGNORE', 'ACCEPT']),
    correctedValue: z.number().positive().optional(),
    /** Absente : l'unité par défaut choisie à l'aperçu s'applique. */
    correctedUnit: z.enum(GLUCOSE_UNITS).optional(),
  })
  .refine((d) => d.action !== 'CORRECT' || d.correctedValue !== undefined, {
    message: 'correctedValue est obligatoire pour une correction',
    path: ['correctedValue'],
  });

export const importCommitSchema = z.object({
  decisions: z
    .array(importDecisionSchema)
    .refine((list) => new Set(list.map((d) => d.line)).size === list.length, {
      message: 'Une seule décision par ligne',
    })
    .default([]),
});
