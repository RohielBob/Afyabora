// Étape « colonnes » de l'import (L4-06, CDC F5 étape 2) : quand le serveur ne reconnaît pas les colonnes
// de date ou de valeur, il renvoie la liste des colonnes du fichier (contrat 0.4.1) et le patient dit
// lui-même laquelle contient quoi. Fonctions PURES (testables sans écran).
//
// Règles : la date et la valeur sont obligatoires ; l'heure, l'unité et le contexte sont facultatifs
// (sans colonne d'unité, c'est l'unité choisie pour le fichier qui s'applique). Une colonne ne sert qu'à
// un seul rôle. Le choix est envoyé tel quel au serveur (`mapping`), qui refait tous les contrôles.
import type { ImportColumnMapping } from '@glyka/shared';

export type ColumnRole = keyof ImportColumnMapping;

/** Rôles dans l'ordre de l'écran ; `required` : à choisir avant de relancer l'analyse. */
export const COLUMN_ROLES: readonly { role: ColumnRole; required: boolean }[] = [
  { role: 'date', required: true },
  { role: 'time', required: false },
  { role: 'value', required: true },
  { role: 'unit', required: false },
  { role: 'context', required: false },
];

/** Choix en cours : nom de colonne pour chaque rôle choisi. */
export type MappingDraft = Partial<Record<ColumnRole, string>>;

export type MappingIssue =
  { kind: 'missing'; role: ColumnRole } | { kind: 'shared'; column: string; roles: ColumnRole[] };

/** Ce qui empêche encore de relancer l'analyse : rôle obligatoire vide, colonne choisie deux fois. */
export function mappingIssues(draft: MappingDraft): MappingIssue[] {
  const issues: MappingIssue[] = [];
  for (const { role, required } of COLUMN_ROLES) {
    if (required && !draft[role]) issues.push({ kind: 'missing', role });
  }
  const byColumn = new Map<string, ColumnRole[]>();
  for (const { role } of COLUMN_ROLES) {
    const column = draft[role];
    if (column) byColumn.set(column, [...(byColumn.get(column) ?? []), role]);
  }
  for (const [column, roles] of byColumn) {
    if (roles.length > 1) issues.push({ kind: 'shared', column, roles });
  }
  return issues;
}

/** Choix complet et sans conflit ⇒ correspondance à envoyer ; sinon null. */
export function toMapping(draft: MappingDraft): ImportColumnMapping | null {
  if (mappingIssues(draft).length > 0 || !draft.date || !draft.value) return null;
  const mapping: ImportColumnMapping = { date: draft.date, value: draft.value };
  if (draft.time) mapping.time = draft.time;
  if (draft.unit) mapping.unit = draft.unit;
  if (draft.context) mapping.context = draft.context;
  return mapping;
}

/**
 * Le serveur renvoie une NOUVELLE liste de colonnes (le patient a choisi un nom absent, ou un autre fichier) :
 * on garde seulement les choix encore valables.
 */
export function keepKnownColumns(draft: MappingDraft, columns: readonly string[]): MappingDraft {
  const kept: MappingDraft = {};
  for (const { role } of COLUMN_ROLES) {
    const column = draft[role];
    if (column && columns.includes(column)) kept[role] = column;
  }
  return kept;
}

/**
 * Le patient choisit `column` pour `role` (`''` = aucune colonne). Une colonne ne sert qu'à un rôle : si
 * elle était prise par un autre rôle, elle lui est retirée (pas de conflit à corriger ensuite).
 */
export function assignColumn(draft: MappingDraft, role: ColumnRole, column: string): MappingDraft {
  const next: MappingDraft = {};
  for (const { role: other } of COLUMN_ROLES) {
    const current = draft[other];
    if (other !== role && current && current !== column) next[other] = current;
  }
  if (column) next[role] = column;
  return next;
}
