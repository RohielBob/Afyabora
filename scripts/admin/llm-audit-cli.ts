// Outil en ligne de commande : lire le journal d'audit du modèle de langage (L3-10).
// Usage : `pnpm admin:llm-audit help` (voir USAGE dans llm-audit.ts). Lecture seule : ne modifie rien.
// Codes de sortie : 0 = affiché, 1 = erreur, 2 = commande mal écrite.
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
// Même déchiffrement que l'API (AES-256-GCM, clé FIELD_ENCRYPTION_KEY de apps/api/.env).
import { decryptField } from '../../apps/api/src/common/crypto/field-encryption.ts';
import {
  USAGE,
  formatDetails,
  formatRow,
  isProblem,
  parseArgs,
  type AuditQuery,
  type AuditRow,
} from './llm-audit.ts';

export interface AuditCliDeps {
  /** Les lignes les plus récentes d'abord. */
  read: (query: AuditQuery) => Promise<AuditRow[]>;
  decrypt: (payload: string) => string;
  print: (text: string) => void;
}

/** Exécute une commande ; renvoie le code de sortie. */
export async function run(argv: readonly string[], deps: AuditCliDeps): Promise<number> {
  const command = parseArgs(argv);
  if ('error' in command) {
    deps.print(`✖ ${command.error}\n\n${USAGE}`);
    return 2;
  }
  if (command.kind === 'help') {
    deps.print(USAGE);
    return 0;
  }
  const rows = await deps.read(command.query);
  if (!rows.length) {
    deps.print(
      command.query.problemsOnly
        ? 'Aucun appel à examiner dans le journal.'
        : "Le journal d'audit est vide (aucun appel au modèle de langage).",
    );
    return 0;
  }
  deps.print(`${rows.length} appel(s), du plus récent au plus ancien :\n`);
  for (const row of rows) {
    deps.print(formatRow(row));
    if (command.query.details) deps.print(formatDetails(row, deps.decrypt));
  }
  return 0;
}

/** Lecture en base : les plus récents d'abord ; « à examiner » = un refus ou un échec. */
function prismaReader(prisma: PrismaClient) {
  return async (query: AuditQuery): Promise<AuditRow[]> => {
    const rows = await prisma.llmAuditLog.findMany({
      where: query.problemsOnly ? { OR: [{ outcome: { not: 'OK' } }, { refused: { gt: 0 } }] } : {},
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });
    return rows.filter((r) => !query.problemsOnly || isProblem(r));
  };
}

/** Point d'entrée quand le fichier est lancé directement (pas quand il est importé par un test). */
export async function main(argv: readonly string[]): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const key = process.env.FIELD_ENCRYPTION_KEY;
    process.exitCode = await run(argv, {
      read: prismaReader(prisma),
      decrypt: (payload) => {
        if (!key)
          throw new Error('FIELD_ENCRYPTION_KEY absente : lancez via « pnpm admin:llm-audit ».');
        return decryptField(payload, key);
      },
      print: (text) => console.log(text),
    });
  } catch (error) {
    // Message court, sans pile technique ni donnée sensible (ex. base injoignable).
    console.error(`✖ ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void main(process.argv.slice(2));
}
