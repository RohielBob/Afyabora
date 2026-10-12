// Journal d'audit des appels au modèle de langage (L3-10, CDC §5.5) : une ligne par appel, pour pouvoir
// retrouver ce que le modèle a répondu et ce que les garde-fous en ont fait.
//  - AUCUN identifiant de patient : les textes envoyés sont les phrases du moteur (chiffres agrégés),
//    partagées entre patients, ou le corps d'une réponse de l'assistant (phrases du moteur ou extrait
//    d'une fiche, L9-07 ; jamais la question du patient) ;
//  - textes envoyés et réponse CHIFFRÉS (AES-256-GCM, même clé que les notes) : ce sont des données de santé ;
//  - lignes de plus de 90 jours effacées à chaque écriture (la table reste petite) ;
//  - le journal ne bloque JAMAIS l'analyse : une écriture qui échoue est signalée dans les journaux
//    techniques (sans aucun texte), et l'API continue.
// Lecture : `pnpm admin:llm-audit` (scripts/admin/llm-audit-cli.ts).
import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { encryptField } from '../../../common/crypto/field-encryption';
import { PrismaService } from '../../../prisma/prisma.service';

/** Durée de conservation du journal, en jours. */
export const AUDIT_RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;

/** SENTENCES et SUMMARY : écran Analyse (L3-05, L3-06) ; ASSISTANT : réponse de l'assistant (L9-07). */
export type AuditKind = 'SENTENCES' | 'SUMMARY' | 'ASSISTANT';
export type AuditOutcome = 'OK' | 'TIMEOUT' | 'UNREACHABLE' | 'HTTP' | 'FORMAT' | 'UNKNOWN';

/** Ce qui est journalisé pour un appel au modèle. */
export interface AuditEntry {
  provider: string;
  model: string;
  kind: AuditKind;
  /** Consigne utilisée (seule son empreinte est gardée). */
  system: string;
  /** Textes envoyés au modèle (phrases du moteur, ou le résumé). */
  inputs: readonly string[];
  /** Réponse brute du modèle ; null s'il n'a pas répondu. */
  output: string | null;
  outcome: AuditOutcome;
  durationMs: number;
  /** Par texte envoyé, dans l'ordre : « accepted » ou la raison du refus ; vide si pas de réponse lisible. */
  decisions: readonly string[];
}

/** Empreinte courte d'une consigne : deux journaux avec la même empreinte ont suivi les mêmes règles. */
export function promptHash(system: string): string {
  return createHash('sha256').update(system).digest('hex').slice(0, 12);
}

@Injectable()
export class LlmAuditService {
  private readonly logger = new Logger(LlmAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Écrit une ligne du journal (et efface les lignes trop anciennes). Ne lève jamais d'erreur. */
  async record(entry: AuditEntry): Promise<void> {
    try {
      const key = this.config.getOrThrow<string>('FIELD_ENCRYPTION_KEY');
      const accepted = entry.decisions.filter((d) => d === 'accepted').length;
      await this.prisma.llmAuditLog.create({
        data: {
          provider: entry.provider,
          model: entry.model,
          kind: entry.kind,
          promptHash: promptHash(entry.system),
          outcome: entry.outcome,
          durationMs: entry.durationMs,
          accepted,
          refused: entry.decisions.length - accepted,
          decisions: [...entry.decisions],
          inputEncrypted: encryptField(JSON.stringify(entry.inputs), key),
          outputEncrypted: entry.output === null ? null : encryptField(entry.output, key),
        },
      });
      await this.prisma.llmAuditLog.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - AUDIT_RETENTION_DAYS * DAY_MS) } },
      });
    } catch {
      this.logger.warn("Journal d'audit du modèle de langage indisponible : appel non journalisé.");
    }
  }
}
