// File de mise en mots des réponses de l'assistant (L9-07, ADR-0005 complétée le 2026-10-11).
//
// Le modèle local met 40 à 90 secondes par réponse sur un PC sans carte graphique : la question n'attend
// JAMAIS. Avec un modèle configuré (LLM_PROVIDER=ollama), une réponse MEASUREMENTS ou SHEET est enregistrée
// « en préparation » (PENDING) avec son texte gabarit déjà chiffré, puis :
//  - UNE SEULE réponse est mise en mots à la fois, dans l'ordre d'arrivée (file en mémoire) ;
//  - le modèle ne reçoit que le CORPS du gabarit (`answer-rewrite.ts`), jamais la question ;
//  - sa réponse est VÉRIFIÉE (`checkAnswerRewrite`) : acceptée ⇒ elle remplace le gabarit (`rephrased`) ;
//    refusée ⇒ le gabarit est gardé ;
//  - DÉLAI : 2 minutes après la question, la réponse est prête quoi qu'il arrive (gabarit si le modèle n'a
//    pas fini ; l'appel au modèle est alors arrêté) ;
//  - modèle injoignable, en erreur ou réponse illisible ⇒ gabarit, et pause d'une minute pendant laquelle
//    les nouvelles réponses sont prêtes tout de suite (sans file) ;
//  - file pleine (MAX_QUEUE) ⇒ la nouvelle réponse est prête tout de suite, en gabarit ;
//  - au DÉMARRAGE de l'API, les réponses restées « en préparation » (arrêt pendant un travail) passent en
//    gabarit ; à la lecture d'une conversation, celles qui ont dépassé le délai aussi (filet de sécurité).
// Urgence, refus et hors sujet ne passent JAMAIS par le modèle (prêts tout de suite, textes fixes).
// Journaux : seulement la décision et la durée, jamais un texte ; journal d'audit chiffré comme en L3-10.
import { Inject, Injectable, Logger, type OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { encryptField } from '../../../common/crypto/field-encryption';
import { PrismaService } from '../../../prisma/prisma.service';
import { FAILURE_OUTCOME, RETRY_AFTER_MS } from '../../insights/llm/insight-writer.service';
import { LlmAuditService, type AuditOutcome } from '../../insights/llm/llm-audit.service';
import { LLM_PROVIDER, LlmError, type LlmProvider } from '../../insights/llm/llm-provider';
import {
  ANSWER_SYSTEM,
  buildAnswerPrompt,
  checkAnswerRewrite,
  composeAnswer,
  parseAnswer,
  type AnswerRewrite,
} from './answer-rewrite';
import type { AssistantAnswer } from './template-answer';

/** Délai maximal entre la question et sa réponse prête (ADR-0005 complétée : 2 minutes). */
export const ANSWER_DEADLINE_MS = 120_000;
/** Marge avant qu'une lecture remette en gabarit une réponse oubliée (la file a la priorité). */
export const OVERDUE_GRACE_MS = 15_000;
/** Réponses en attente au plus : au-delà, la réponse est prête tout de suite, en gabarit. */
export const MAX_QUEUE = 50;

/** Une réponse à mettre en mots. */
export interface RewriteJob {
  answerId: string;
  rewrite: AnswerRewrite;
  /** Heure de la question : le délai de 2 minutes part d'elle. */
  askedAt: Date;
}

@Injectable()
export class AnswerWriter implements OnModuleInit {
  private readonly logger = new Logger('Assistant');
  private readonly queue: RewriteJob[] = [];
  private running: Promise<void> | null = null;
  private pausedUntil = 0;
  /** Délai de 2 minutes (modifiable par les tests seulement). */
  deadlineMs = ANSWER_DEADLINE_MS;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider | null,
    // Facultatif : absent dans certains tests, le journal d'audit n'est alors pas écrit.
    @Optional() private readonly audit?: LlmAuditService,
  ) {}

  /** Démarrage : les réponses restées « en préparation » (API arrêtée pendant un travail) ⇒ gabarit. */
  async onModuleInit(): Promise<void> {
    const { count } = await this.prisma.assistantMessage.updateMany({
      where: { status: 'PENDING' },
      data: { status: 'READY' },
    });
    if (count > 0)
      this.logger.warn(`${count} réponse(s) restée(s) en préparation : gabarit utilisé.`);
  }

  /** Vrai si cette réponse sera mise en mots par le modèle (enregistrée PENDING), faux si elle est prête. */
  willRewrite(answer: AssistantAnswer): boolean {
    return (
      this.llm !== null &&
      answer.rewrite !== undefined &&
      this.queue.length < MAX_QUEUE &&
      Date.now() >= this.pausedUntil
    );
  }

  /** Ajoute une réponse (déjà enregistrée PENDING) à la file ; la file se vide en arrière-plan. */
  enqueue(job: RewriteJob): void {
    this.queue.push(job);
    if (!this.running) {
      this.running = this.drain().finally(() => {
        this.running = null;
      });
    }
  }

  /** Attend que la file soit vide (tests, arrêt propre). */
  async idle(): Promise<void> {
    while (this.running) await this.running;
  }

  /**
   * Filet de sécurité à la lecture : les réponses de ce patient « en préparation » depuis plus du délai
   * (+ une marge) passent en gabarit.
   */
  async settleOverdue(patientId: string): Promise<void> {
    await this.prisma.assistantMessage.updateMany({
      where: {
        patientId,
        status: 'PENDING',
        createdAt: { lt: new Date(Date.now() - this.deadlineMs - OVERDUE_GRACE_MS) },
      },
      data: { status: 'READY' },
    });
  }

  private async drain(): Promise<void> {
    for (let job = this.queue.shift(); job; job = this.queue.shift()) {
      await this.process(job);
    }
  }

  /** Une réponse : le modèle si le délai le permet, sinon (ou au moindre problème) le gabarit. */
  private async process(job: RewriteJob): Promise<void> {
    const llm = this.llm;
    const remaining = job.askedAt.getTime() + this.deadlineMs - Date.now();
    if (!llm || remaining <= 0 || Date.now() < this.pausedUntil) {
      this.logger.log('Mise en mots non tentée (délai dépassé ou modèle en pause) : gabarit.');
      await this.settle(job.answerId, null);
      return;
    }
    const started = Date.now();
    const inputs = [job.rewrite.body];
    const deadline = AbortSignal.timeout(remaining);
    let raw: string;
    try {
      raw = await this.generate(llm, job.rewrite.body, deadline);
    } catch (error) {
      const reason = error instanceof LlmError ? error.reason : null;
      // Délai de 2 minutes atteint : le modèle est lent, pas en panne (pas de pause).
      if (!deadline.aborted) this.pausedUntil = Date.now() + RETRY_AFTER_MS;
      this.logger.warn(
        `Mise en mots (${llm.name}) indisponible : ${deadline.aborted ? 'délai de 2 minutes' : (reason ?? 'inconnue')} ; gabarit.`,
      );
      await this.journal(
        llm,
        inputs,
        started,
        null,
        reason ? FAILURE_OUTCOME[reason] : 'UNKNOWN',
        [],
      );
      await this.settle(job.answerId, null);
      return;
    }
    const text = parseAnswer(raw);
    if (text === null) {
      this.pausedUntil = Date.now() + RETRY_AFTER_MS;
      this.logger.warn(`Mise en mots (${llm.name}) : réponse au mauvais format ; gabarit.`);
      await this.journal(llm, inputs, started, raw, 'FORMAT', []);
      await this.settle(job.answerId, null);
      return;
    }
    const problem = checkAnswerRewrite(job.rewrite.body, text);
    await this.journal(llm, inputs, started, raw, 'OK', [problem ?? 'accepted']);
    await this.settle(job.answerId, problem ? null : composeAnswer(job.rewrite, text));
    this.logger.log(
      `Mise en mots (${llm.name}, ${llm.model}) : ${problem ? `refusée [${problem}], gabarit` : 'acceptée'} ` +
        `en ${Date.now() - started} ms.`,
    );
  }

  /**
   * Texte brut du modèle. Le délai de 2 minutes coupe l'attente même si le fournisseur ignorait l'arrêt
   * demandé (son résultat tardif est alors ignoré).
   */
  private generate(llm: LlmProvider, body: string, deadline: AbortSignal): Promise<string> {
    const generation = llm.generate({
      system: ANSWER_SYSTEM,
      prompt: buildAnswerPrompt(body),
      signal: deadline,
    });
    generation.catch(() => undefined); // un échec après le délai ne doit pas rester « non géré »
    const stopped = new Promise<never>((_, reject) => {
      const stop = () => reject(new LlmError('timeout'));
      if (deadline.aborted) stop();
      else deadline.addEventListener('abort', stop, { once: true });
    });
    return Promise.race([generation, stopped]);
  }

  /**
   * Réponse prête : le texte du modèle (vérifié) remplace le gabarit, ou le gabarit déjà enregistré est
   * gardé (`text` null). Rien ne change si la réponse n'est plus en préparation ou a été effacée.
   */
  private async settle(answerId: string, text: string | null): Promise<void> {
    try {
      await this.prisma.assistantMessage.updateMany({
        where: { id: answerId, status: 'PENDING' },
        data:
          text === null
            ? { status: 'READY' }
            : {
                status: 'READY',
                textEncrypted: encryptField(
                  text,
                  this.config.getOrThrow<string>('FIELD_ENCRYPTION_KEY'),
                ),
                rephrased: true,
              },
      });
    } catch {
      // La lecture suivante (settleOverdue) ou le prochain démarrage remettront le gabarit.
      this.logger.warn('Réponse de l’assistant non enregistrée : gabarit à la prochaine lecture.');
    }
  }

  private async journal(
    llm: LlmProvider,
    inputs: string[],
    started: number,
    output: string | null,
    outcome: AuditOutcome,
    decisions: string[],
  ): Promise<void> {
    await this.audit?.record({
      provider: llm.name,
      model: llm.model,
      kind: 'ASSISTANT',
      system: ANSWER_SYSTEM,
      inputs,
      output,
      outcome,
      durationMs: Date.now() - started,
      decisions,
    });
  }
}
