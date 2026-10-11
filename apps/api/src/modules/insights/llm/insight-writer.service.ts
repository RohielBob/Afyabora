// Met en mots les observations (L3-05) : phrases reformulées par le modèle de langage QUAND elles sont
// prêtes et validées, sinon les gabarits du moteur (repli automatique, ADR-0005).
//
// Le modèle local peut mettre 20 à 45 secondes (mesuré avec llama3.1 sur un PC sans carte graphique) :
// GET /insights ne l'attend JAMAIS. Il répond tout de suite avec les gabarits, la reformulation des phrases
// manquantes part en arrière-plan, et les réponses suivantes l'utilisent (mémoire par phrase du moteur).
//  - une seule génération à la fois (le modèle local n'en fait qu'une efficacement) ;
//  - phrase refusée par les garde-fous ⇒ le gabarit est retenu pour cette phrase (pas de nouvel essai) ;
//  - modèle injoignable, trop lent ou réponse illisible ⇒ gabarits, nouvel essai après une pause ;
//  - journaux : nombres de phrases acceptées / refusées et raisons, JAMAIS les phrases (données de santé).
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { InsightWithText } from '@glyka/analytics';
import { LLM_PROVIDER, LlmError, type LlmProvider } from './llm-provider';
import { buildPrompt, checkRewrite, parseTexts, REPHRASE_SYSTEM } from './rephrase';

/** Nombre maximal de phrases gardées en mémoire (les plus anciennes sont oubliées). */
export const CACHE_LIMIT = 1000;
/** Pause après un échec du modèle avant de réessayer (évite de le solliciter en boucle). */
export const RETRY_AFTER_MS = 60_000;

@Injectable()
export class InsightWriter {
  private readonly logger = new Logger(InsightWriter.name);
  /** Phrase du moteur → phrase à afficher (reformulation validée, ou la phrase du moteur si refusée). */
  private readonly cache = new Map<string, string>();
  private running: Promise<void> | null = null;
  private pausedUntil = 0;

  constructor(@Inject(LLM_PROVIDER) private readonly llm: LlmProvider | null) {}

  /**
   * Observations avec la meilleure phrase disponible TOUT DE SUITE. Lance (sans l'attendre) la
   * reformulation des phrases pas encore connues.
   */
  write(insights: readonly InsightWithText[]): InsightWithText[] {
    if (!this.llm || insights.length === 0) return [...insights];
    const missing = [...new Set(insights.map((i) => i.text))].filter((t) => !this.cache.has(t));
    if (missing.length > 0 && !this.running && Date.now() >= this.pausedUntil) {
      const llm = this.llm;
      this.running = this.generate(llm, missing).finally(() => {
        this.running = null;
      });
    }
    return insights.map((insight) => ({
      ...insight,
      text: this.cache.get(insight.text) ?? insight.text,
    }));
  }

  /** Attend la fin de la reformulation en cours (tests, arrêt propre). */
  async idle(): Promise<void> {
    await this.running;
  }

  private async generate(llm: LlmProvider, sentences: string[]): Promise<void> {
    const started = Date.now();
    let raw: string;
    try {
      raw = await llm.generate({ system: REPHRASE_SYSTEM, prompt: buildPrompt(sentences) });
    } catch (error) {
      this.pausedUntil = Date.now() + RETRY_AFTER_MS;
      const reason = error instanceof LlmError ? error.reason : 'inconnue';
      this.logger.warn(`Reformulation (${llm.name}) indisponible : ${reason} ; gabarits utilisés.`);
      return;
    }
    const texts = parseTexts(raw, sentences.length);
    if (!texts) {
      this.pausedUntil = Date.now() + RETRY_AFTER_MS;
      this.logger.warn(
        `Reformulation (${llm.name}) : réponse au mauvais format ; gabarits utilisés.`,
      );
      return;
    }
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
  }

  private remember(sentence: string, text: string): void {
    if (this.cache.size >= CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(sentence, text);
  }
}
