// Lecture du journal d'audit du modèle de langage (L3-10) : la LOGIQUE, sans base de données ni terminal.
// Lecture des arguments et mise en forme. Testée dans llm-audit.test.ts ; la base et le déchiffrement
// sont dans llm-audit-cli.ts.
//
// Par défaut, l'outil n'affiche AUCUN texte (seulement dates, modèle, résultat, décisions) : les textes
// envoyés et reçus sont des données de santé ; ils ne sont déchiffrés qu'avec --details.

/** Une ligne du journal, telle que lue en base (textes encore chiffrés). */
export interface AuditRow {
  createdAt: Date;
  provider: string;
  model: string;
  kind: string;
  promptHash: string;
  outcome: string;
  durationMs: number;
  accepted: number;
  refused: number;
  decisions: string[];
  inputEncrypted: string;
  outputEncrypted: string | null;
}

export interface AuditQuery {
  limit: number;
  /** Seulement les appels avec un refus ou un échec (ce qu'il faut examiner). */
  problemsOnly: boolean;
  /** Déchiffrer et afficher les textes envoyés et la réponse du modèle. */
  details: boolean;
}

export type Command = { kind: 'list'; query: AuditQuery } | { kind: 'help' };

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 200;

export const USAGE = [
  "Journal d'audit du modèle de langage — usage :",
  '  pnpm admin:llm-audit [--limit=20] [--problems] [--details]',
  '',
  '  --limit=N   : les N appels les plus récents (1 à 200, défaut 20)',
  '  --problems  : seulement les appels avec un texte refusé ou un échec du modèle',
  '  --details   : déchiffre et affiche les textes envoyés et la réponse (données de santé :',
  '                à utiliser seulement pour un audit, jamais dans un rapport public)',
].join('\n');

/** Lit les arguments ; renvoie un message d'erreur (en français) si la commande est mal écrite. */
export function parseArgs(argv: readonly string[]): Command | { error: string } {
  const args = argv.filter((a) => a !== '--'); // « pnpm … -- x » transmet parfois « -- »
  if (args.includes('--help') || args.includes('help')) return { kind: 'help' };
  const query: AuditQuery = { limit: DEFAULT_LIMIT, problemsOnly: false, details: false };
  for (const arg of args) {
    if (arg === '--problems') query.problemsOnly = true;
    else if (arg === '--details') query.details = true;
    else if (arg.startsWith('--limit=')) {
      const limit = Number(arg.slice('--limit='.length));
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        return { error: `--limit doit être un entier de 1 à ${MAX_LIMIT}.` };
      }
      query.limit = limit;
    } else if (arg.startsWith('--')) return { error: `Option inconnue : ${arg}` };
    else return { error: `Argument en trop : ${arg}` };
  }
  return { kind: 'list', query };
}

const pad = (n: number) => String(n).padStart(2, '0');
/** « 2026-10-11 14:05 » (heure UTC, la même pour toute l'équipe). */
export function formatDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

const KIND_FR: Record<string, string> = { SENTENCES: 'phrases', SUMMARY: 'résumé' };
const OUTCOME_FR: Record<string, string> = {
  OK: 'réponse reçue',
  TIMEOUT: 'trop lent',
  UNREACHABLE: 'injoignable',
  HTTP: 'erreur HTTP',
  FORMAT: 'mauvais format',
  UNKNOWN: 'erreur inconnue',
};

/** Une ligne de résumé, SANS aucun texte (pas de donnée de santé). */
export function formatRow(row: AuditRow): string {
  const seconds = (row.durationMs / 1000).toFixed(1).replace('.', ',');
  const result =
    row.outcome === 'OK'
      ? `${row.accepted} accepté(s), ${row.refused} refusé(s)${row.refused ? ` [${row.decisions.filter((d) => d !== 'accepted').join(', ')}]` : ''}`
      : (OUTCOME_FR[row.outcome] ?? row.outcome);
  return [
    formatDate(row.createdAt),
    `${row.provider}/${row.model}`,
    KIND_FR[row.kind] ?? row.kind,
    result,
    `${seconds} s`,
    `consigne ${row.promptHash}`,
  ].join(' · ');
}

/** Un appel est « à examiner » s'il a un texte refusé ou si le modèle n'a pas répondu correctement. */
export const isProblem = (row: AuditRow) => row.outcome !== 'OK' || row.refused > 0;

/** Détail d'un appel : textes envoyés avec la décision de chacun, puis la réponse brute du modèle. */
export function formatDetails(row: AuditRow, decrypt: (payload: string) => string): string {
  const inputs = JSON.parse(decrypt(row.inputEncrypted)) as string[];
  const lines = inputs.map((text, i) => `    [${row.decisions[i] ?? 'sans décision'}] ${text}`);
  const output = row.outputEncrypted === null ? '(pas de réponse)' : decrypt(row.outputEncrypted);
  // Chaque ligne de la réponse est décalée (le modèle répond parfois sur plusieurs lignes).
  const answer = output.split('\n').map((line) => `    ${line}`);
  return [`  Textes envoyés :`, ...lines, `  Réponse du modèle :`, ...answer].join('\n');
}
