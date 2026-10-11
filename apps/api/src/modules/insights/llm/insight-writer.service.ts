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
//  - journaux : nombres de textes acceptés / refusés et raisons, JAMAIS les textes (données de santé).
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { InsightWithText } from '@glyka/analytics';
import { LLM_PROVIDER, LlmError, type LlmProvider } from './llm-provider';
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

  constructor(@Inject(LLM_PROVIDER) private readonly llm: LlmProvider | null) {}

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
    const raw = await this.ask(llm, REPHRASE_SYSTEM, buildPrompt(sentences));
    if (raw === null) return false;
    const texts = parseTexts(raw, sentences.length);
    if (!texts) return this.badFormat(llm);
    const refused: string[] = [];
    sentences.forEach((sentence, i) => {
      const problem = checkRewrite(sentence, texts[i] as string);
      if (problem) refused.push(problem);
      this.remember(sentence, problem ? sentence : (texts[i] as string));
    });
    this.logger.log(
      `Reformulation (${llm.name}, ${llm.model}) : ${sentences.length - refused.length} acceptée(s), ` +
        `${refused.length} refusée(s)${refused.length ? ` [${refused.join(', ')}]` : ''} ` +
        `en ${Date.now() - started} ms.`,
    );
    return true;
  }

  private async rephraseSummary(llm: LlmProvider, summary: string): Promise<void> {
    const started = Date.now();
    const raw = await this.ask(llm, SUMMARY_SYSTEM, buildSummaryPrompt(summary));
    if (raw === null) return;
    const text = parseSummary(raw);
    if (text === null) {
      this.badFormat(llm);
      return;
    }
    const problem = checkRewrite(summary, text, MAX_SUMMARY_LENGTH);
    this.remember(summary, problem ? summary : text);
    this.logger.log(
      `Résumé (${llm.name}, ${llm.model}) : ${problem ? `refusé [${problem}]` : 'accepté'} ` +
        `en ${Date.now() - started} ms.`,
    );
  }

  /** Texte brut du modèle, ou null s'il n'a pas répondu (pause avant le prochain essai). */
  private async ask(llm: LlmProvider, system: string, prompt: string): Promise<string | null> {
    try {
      return await llm.generate({ system, prompt });
    } catch (error) {
      this.pausedUntil = Date.now() + RETRY_AFTER_MS;
      const reason = error instanceof LlmError ? error.reason : 'inconnue';
      this.logger.warn(`Reformulation (${llm.name}) indisponible : ${reason} ; gabarits utilisés.`);
      return null;
    }
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
