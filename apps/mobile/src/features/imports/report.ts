// Étapes 4 et 5 de l'import (L4-07, CDC F5) : rapport d'analyse, puis décisions du patient ligne par ligne
// ou en lot (Corriger · Ignorer · Accepter), puis « Importer ». Fonctions PURES (testables sans écran).
//
// Règles (contrat POST /imports/{id}/commit, L4-04) :
//  - sans décision : lignes valides importées ; doublons, incohérentes et rejetées IGNORÉES ;
//  - Accepter : importer la ligne telle quelle (incohérente ou doublon, choisi par le patient) ;
//    impossible pour une ligne rejetée (rien de lisible à importer) ;
//  - Corriger : nouvelle valeur (et unité) ; elle doit être plausible (20–600 mg/dL), comme au serveur.
// Le serveur refait tous les contrôles ; une décision qu'il refuse est montrée sur SA ligne.
import {
  isPlausible,
  parseDecimal,
  type GlucoseUnit,
  type ImportDecision,
  type ImportReport,
  type ImportRowReport,
  type ImportRowStatus,
} from '@glyka/shared';
import { ApiError } from '@/lib/api-client';

export type RowAction = ImportDecision['action'];

/** Choix du patient pour une ligne ; `value` : texte tapé (virgule ou point), `unit` : unité corrigée. */
export interface RowChoice {
  action: RowAction;
  value?: string;
  unit?: GlucoseUnit;
}

/** Choix en cours, par numéro de ligne. Ligne absente = action par défaut (Ignorer). */
export type Choices = Readonly<Record<number, RowChoice>>;

/** Groupes du rapport, dans l'ordre de l'écran : d'abord ce qui demande un regard. */
export const REPORT_GROUPS = ['INCONSISTENT', 'DUPLICATE', 'ERROR'] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number];

/** Lignes non valides du rapport, par groupe, dans l'ordre du fichier. */
export function groupRows(report: ImportReport): Record<ReportGroup, ImportRowReport[]> {
  const groups: Record<ReportGroup, ImportRowReport[]> = {
    INCONSISTENT: [],
    DUPLICATE: [],
    ERROR: [],
  };
  for (const row of [...report.rows].sort((a, b) => a.line - b.line)) {
    if (row.status !== 'VALID') groups[row.status].push(row);
  }
  return groups;
}

/** Actions possibles pour une ligne : une ligne rejetée ne peut pas être acceptée telle quelle. */
export function allowedActions(status: ImportRowStatus): RowAction[] {
  return status === 'ERROR' ? ['IGNORE', 'CORRECT'] : ['IGNORE', 'ACCEPT', 'CORRECT'];
}

/** « Tout accepter » / « Tout ignorer » d'un groupe ; une correction déjà en cours est gardée. */
export function chooseForAll(
  choices: Choices,
  rows: readonly ImportRowReport[],
  action: Extract<RowAction, 'IGNORE' | 'ACCEPT'>,
): Choices {
  const next: Record<number, RowChoice> = { ...choices };
  for (const row of rows) {
    if (!allowedActions(row.status).includes(action)) continue;
    if (next[row.line]?.action === 'CORRECT') continue;
    next[row.line] = { action };
  }
  return next;
}

export type CorrectionProblem = 'missing' | 'invalid' | 'outOfRange';

/** Valeur corrigée : nombre positif lisible (« 1,87 » ou « 1.87 »), plausible dans son unité. */
export function checkCorrection(
  value: string | undefined,
  unit: GlucoseUnit,
): CorrectionProblem | null {
  if (!value?.trim()) return 'missing';
  const number = parseDecimal(value);
  if (number === null || number <= 0) return 'invalid';
  if (!isPlausible(number, unit)) return 'outOfRange';
  return null;
}

/**
 * Décisions à envoyer + problèmes à montrer avant l'envoi. Seules les décisions qui changent quelque
 * chose sont envoyées : Accepter et Corriger (Ignorer est déjà l'action par défaut du serveur).
 */
export function buildDecisions(
  report: ImportReport,
  choices: Choices,
  defaultUnit: GlucoseUnit,
): { decisions: ImportDecision[]; problems: Record<number, CorrectionProblem> } {
  const decisions: ImportDecision[] = [];
  const problems: Record<number, CorrectionProblem> = {};
  for (const row of [...report.rows].sort((a, b) => a.line - b.line)) {
    const choice = choices[row.line];
    if (!choice || choice.action === 'IGNORE') continue;
    if (!allowedActions(row.status).includes(choice.action)) continue;
    if (choice.action === 'ACCEPT') {
      decisions.push({ line: row.line, action: 'ACCEPT' });
      continue;
    }
    const unit = choice.unit ?? defaultUnit;
    const problem = checkCorrection(choice.value, unit);
    if (problem) {
      problems[row.line] = problem;
      continue;
    }
    decisions.push({
      line: row.line,
      action: 'CORRECT',
      correctedValue: parseDecimal(choice.value ?? '') ?? 0,
      ...(choice.unit && choice.unit !== defaultUnit ? { correctedUnit: choice.unit } : {}),
    });
  }
  return { decisions, problems };
}

/** Nombre de mesures que « Importer » va créer : les valides + les lignes acceptées ou corrigées. */
export function importCount(report: ImportReport, choices: Choices): number {
  const kept = report.rows.filter((row) => {
    const action = choices[row.line]?.action;
    return (
      action !== undefined && action !== 'IGNORE' && allowedActions(row.status).includes(action)
    );
  }).length;
  return report.valid + kept;
}

/**
 * Issue d'un import (ou d'une annulation) ratés :
 *  - offline : pas de réponse ;
 *  - done : 409 IMPORT_ALREADY_COMMITTED (déjà importé ou annulé, par exemple depuis un autre téléphone) ;
 *  - expired : autre 409 (aperçu de plus de 24 h : relancer l'analyse) ;
 *  - rows : 400 sur des décisions précises ⇒ message sur la ligne concernée ;
 *  - notFound : 404 (lot introuvable) ;
 *  - error : le reste.
 */
export type CommitProblem =
  | { kind: 'offline' | 'done' | 'expired' | 'notFound' | 'error' }
  | { kind: 'rows'; byLine: Record<number, string> };

export function commitProblem(error: unknown, decisions: readonly ImportDecision[]): CommitProblem {
  if (!(error instanceof ApiError)) return { kind: 'error' };
  if (error.status === 0) return { kind: 'offline' };
  if (error.status === 404) return { kind: 'notFound' };
  if (error.status === 409) {
    return { kind: error.code === 'IMPORT_ALREADY_COMMITTED' ? 'done' : 'expired' };
  }
  if (error.status === 400) {
    const byLine: Record<number, string> = {};
    for (const issue of error.issues) {
      const index = /^decisions\.(\d+)\./.exec(issue.path)?.[1];
      const decision = index === undefined ? undefined : decisions[Number(index)];
      if (decision) byLine[decision.line] = issue.message;
    }
    if (Object.keys(byLine).length > 0) return { kind: 'rows', byLine };
  }
  return { kind: 'error' };
}

/** Lignes montrées par groupe au départ, puis par paquets (un fichier abîmé peut en compter 5 000). */
export const ROWS_PAGE = 30;

/** Lignes affichées d'un groupe (`shown` premières) et taille du prochain paquet (« Voir 10 lignes de plus »). */
export function pageOf<T>(rows: readonly T[], shown: number): { visible: T[]; next: number } {
  return {
    visible: rows.slice(0, shown),
    next: Math.min(ROWS_PAGE, Math.max(0, rows.length - shown)),
  };
}
