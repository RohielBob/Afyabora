// Met en mots l'analyse (L3-05, L3-06) : phrases des observations et RÉSUMÉ de la période, reformulés par le
// modèle de langage QUAND ils sont prêts et validés, sinon les gabarits du moteur (repli automatique,
// ADR-0005).
//
// Le modèle local peut mettre 20 à 90 secondes (mesuré sur un PC sans carte graphique : llama3.1 ≈ 30 s,
// mistral-nemo ≈ 47 s par lot de 5 phrases) : GET /insights ne l'attend JAMAIS. Il répond tout de suite avec
// les gabarits ; ce qui manque part en arrière-plan (les phrases, puis le résumé, dans la même tâche), et
// les réponses suivantes l'utilisent (mémoire par texte du moteur).
//  - une seule tâche à la fois (le modèle local n'en fait qu'une efficacement) ;
//  - texte refusé par les garde-fous ⇒ le gabarit est retenu pour ce texte (pas de nouvel essai) ;
//  - modèle injoignable, trop lent ou réponse illisible ⇒ gabarits, nouvel essai après une pause ;
//  - journaux : nombres de textes acceptés / refusés et raisons, JAMAIS les textes (données de santé) ;
//  - JOURNAL D'AUDIT (L3-10) : chaque appel au modèle (textes envoyés et réponse chiffrés, décision des
//    garde-fous, résultat, durée) est écrit par LlmAuditService, sans jamais bloquer.
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { InsightWithText } from '@glyka/analytics';
import { LlmAuditService, type AuditKind, type AuditOutcome } from './llm-audit.service';
import { LLM_PROVIDER, LlmError, type LlmFailure, type LlmProvider } from './llm-provider';
import {
  MAX_SUMMARY_LENGTH,
  REPHRASE_SYSTEM,
  SUMMARY_SYSTEM,
  buildPrompt,
  buildSummaryPrompt,
  checkRewrite,
  parseSummary,
  parseTexts,
} from './rephrase';

/** Nombre maximal de textes gardés en mémoire (les plus anciens sont oubliés). */
export const CACHE_LIMIT = 1000;
/** Pause après un échec du modèle avant de réessayer (évite de le solliciter en boucle). */
export const RETRY_AFTER_MS = 60_000;

/** Un appel au modèle, tel qu'il sera journalisé. */
interface Call {
  llm: LlmProvider;
  kind: AuditKind;
  system: string;
  inputs: readonly string[];
  started: number;
}

/** Raison d'une panne du modèle → résultat écrit dans le journal d'audit (aussi pour l'assistant, L9-07). */
export const FAILURE_OUTCOME: Record<LlmFailure, AuditOutcome> = {
  timeout: 'TIMEOUT',
  unreachable: 'UNREACHABLE',
  http: 'HTTP',
  format: 'FORMAT',
};

/** Ce qui est affiché : observations et résumé, avec le meilleur texte disponible tout de suite. */
export interface Written {
  insights: InsightWithText[];
  /** Résumé à afficher (absent si aucun résumé n'a été donné). */
  summary?: string;
}

@Injectable()
export class InsightWriter {
  private readonly logger = new Logger(InsightWriter.name);
  /** Texte du moteur → texte à afficher (reformulation validée, ou le texte du moteur si refusée). */
  private readonly cache = new Map<string, string>();
  private running: Promise<void> | null = null;
  private pausedUntil = 0;

  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider | null,
    // Facultatif : absent dans certains tests, le journal d'audit n'est alors pas écrit.
    @Optional() private readonly audit?: LlmAuditService,
  ) {}

  /**
   * Observations et résumé avec le meilleur texte disponible TOUT DE SUITE. Lance (sans l'attendre) la
   * reformulation de ce qui n'est pas encore connu.
   */
  write(insights: readonly InsightWithText[], summary?: string): Written {
    if (!this.llm) return { insights: [...insights], summary };
    const sentences = [...new Set(insights.map((i) => i.text))].filter((t) => !this.cache.has(t));
    const newSummary = summary === undefined || this.cache.has(summary) ? null : summary;
    if ((sentences.length > 0 || newSummary) && !this.running && Date.now() >= this.pausedUntil) {
      const llm = this.llm;
      this.running = this.generate(llm, sentences, newSummary).finally(() => {
        this.running = null;
      });
    }
    return {
      insights: insights.map((insight) => ({
        ...insight,
        text: this.cache.get(insight.text) ?? insight.text,
      })),
      summary: summary === undefined ? undefined : (this.cache.get(summary) ?? summary),
    };
  }

  /** Attend la fin de la reformulation en cours (tests, arrêt propre). */
  async idle(): Promise<void> {
    await this.running;
  }

  /** Une tâche : les phrases manquantes (un seul appel), puis le résumé s'il manque. */
  private async generate(
    llm: LlmProvider,
    sentences: string[],
    summary: string | null,
  ): Promise<void> {
    if (sentences.length > 0) {
      const ok = await this.rephraseSentences(llm, sentences);
      if (!ok) return; // modèle en panne : pas la peine d'essayer le résumé maintenant
    }
    if (summary) await this.rephraseSummary(llm, summary);
  }

  /** Reformule les phrases ; false si le modèle n'a pas répondu correctement (pause déclenchée). */
  private async rephraseSentences(llm: LlmProvider, sentences: string[]): Promise<boolean> {
    const started = Date.now();
    const call = {
      llm,
      kind: 'SENTENCES' as const,
      system: REPHRASE_SYSTEM,
      inputs: sentences,
      started,
    };
    const raw = await this.ask(call, buildPrompt(sentences));
    if (raw === null) return false;
    const texts = parseTexts(raw, sentences.length);
    if (!texts) {
      await this.journal(call, raw, 'FORMAT', []);
      return this.badFormat(llm);
    }
    const refused: string[] = [];
    const decisions = sentences.map((sentence, i) => {
      const problem = checkRewrite(sentence, texts[i] as string);
      if (problem) refused.push(problem);
      this.remember(sentence, problem ? sentence : (texts[i] as string));
      return problem ?? 'accepted';
    });
    await this.journal(call, raw, 'OK', decisions);
    this.logger.log(
      `Reformulation (${llm.name}, ${llm.model}) : ${sentences.length - refused.length} acceptée(s), ` +
        `${refused.length} refusée(s)${refused.length ? ` [${refused.join(', ')}]` : ''} ` +
        `en ${Date.now() - started} ms.`,
    );
    return true;
  }

  private async rephraseSummary(llm: LlmProvider, summary: string): Promise<void> {
    const started = Date.now();
    const call = {
      llm,
      kind: 'SUMMARY' as const,
      system: SUMMARY_SYSTEM,
      inputs: [summary],
      started,
    };
    const raw = await this.ask(call, buildSummaryPrompt(summary));
    if (raw === null) return;
    const text = parseSummary(raw);
    if (text === null) {
      await this.journal(call, raw, 'FORMAT', []);
      this.badFormat(llm);
      return;
    }
    const problem = checkRewrite(summary, text, MAX_SUMMARY_LENGTH);
    this.remember(summary, problem ? summary : text);
    await this.journal(call, raw, 'OK', [problem ?? 'accepted']);
    this.logger.log(
      `Résumé (${llm.name}, ${llm.model}) : ${problem ? `refusé [${problem}]` : 'accepté'} ` +
        `en ${Date.now() - started} ms.`,
    );
  }

  /**
   * Texte brut du modèle, ou null s'il n'a pas répondu (pause avant le prochain essai ; l'échec est
   * journalisé dans l'audit, sans réponse).
   */
  private async ask(call: Call, prompt: string): Promise<string | null> {
    const { llm, system } = call;
    try {
      return await llm.generate({ system, prompt });
    } catch (error) {
      this.pausedUntil = Date.now() + RETRY_AFTER_MS;
      const reason = error instanceof LlmError ? error.reason : null;
      this.logger.warn(
        `Reformulation (${llm.name}) indisponible : ${reason ?? 'inconnue'} ; gabarits utilisés.`,
      );
      await this.journal(call, null, reason ? FAILURE_OUTCOME[reason] : 'UNKNOWN', []);
      return null;
    }
  }

  /** Écrit la ligne du journal d'audit de cet appel (si le journal est branché). */
  private async journal(
    call: Call,
    output: string | null,
    outcome: AuditOutcome,
    decisions: string[],
  ): Promise<void> {
    await this.audit?.record({
      provider: call.llm.name,
      model: call.llm.model,
      kind: call.kind,
      system: call.system,
      inputs: call.inputs,
      output,
      outcome,
      durationMs: Date.now() - call.started,
      decisions,
    });
  }

  private badFormat(llm: LlmProvider): false {
    this.pausedUntil = Date.now() + RETRY_AFTER_MS;
    this.logger.warn(
      `Reformulation (${llm.name}) : réponse au mauvais format ; gabarits utilisés.`,
    );
    return false;
  }

  private remember(source: string, text: string): void {
    if (this.cache.size >= CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(source, text);
  }
}
