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

export const importCommitSchema = z.object({
  decisions: z
    .array(
      z.object({
        line: z.number().int().positive(),
        action: z.enum(['CORRECT', 'IGNORE', 'ACCEPT']),
        correctedValue: z.number().positive().optional(),
        correctedUnit: z.enum(GLUCOSE_UNITS).optional(),
      }),
    )
    .default([]),
});
