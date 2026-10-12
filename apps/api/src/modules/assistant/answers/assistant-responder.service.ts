// Réponse de l'assistant à une question (L9-06) : l'ordre de décision de l'ADR-0005 complétée.
//   1. Filtre de sécurité (L3-07, `screenQuestion`), en conversation (L9-08, `screenInConversation` : une
//      question de suite est jugée avec les précédentes) : urgence ⇒ EMERGENCY avec le numéro d'urgence, le
//      proche et le médecin du profil ; dose, traitement, diagnostic, prédiction, détournement ⇒ REFUSAL.
//   2. Question sur les MESURES du patient ⇒ MEASUREMENTS : résumé et observations du moteur.
//   3. Question générale ⇒ SHEET : extrait de la fiche la plus pertinente, citée.
//   4. Sinon ⇒ OUT_OF_SCOPE : « hors sujet » ou « pas de réponse sûre ». Jamais d'invention.
// Tout est déterministe : le modèle de langage n'intervient pas ici. Les réponses MEASUREMENTS et SHEET
// indiquent seulement ce qu'il pourra mettre en mots (`rewrite`, L9-07 : `answer-writer.service.ts`).
import { Injectable } from '@nestjs/common';
import type { KnowledgeSheetRef } from '@glyka/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { REFUSAL_ANSWERS, normalizeQuestion } from '../../insights/guardrails/question-guard';
import { InsightsService } from '../../insights/insights.service';
import { SheetsService } from '../knowledge/sheets.service';
import { emergencyAnswer, type EmergencyContacts } from './emergency-answer';
import { composeAnswer, type AnswerRewrite } from './answer-rewrite';
import { screenInConversation } from './conversation-guard';
import { measurementRewrite } from './measurement-answer';
import { focusOf, isMeasurementQuestion, periodOf } from './routing';
import { bestSheet, sheetAnswer } from './sheet-answer';
import { ASSISTANT_TEMPLATES, type AssistantAnswer } from './template-answer';

/** Fiche citée avec une réponse d'urgence (gestes et situations : « Quand demander de l'aide »). */
export const EMERGENCY_SHEET_ID = 'quand-demander-de-l-aide';

@Injectable()
export class AssistantResponder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly insights: InsightsService,
    private readonly sheets: SheetsService,
  ) {}

  /**
   * Réponse à `question`. `previous` : les questions précédentes du patient dans cette conversation (les
   * plus récentes, de la plus ancienne à la plus récente), pour reconnaître un piège découpé (L9-08).
   */
  async answer(
    patientId: string,
    question: string,
    previous: readonly string[] = [],
  ): Promise<AssistantAnswer> {
    const verdict = screenInConversation(question, previous);
    if (verdict.refused && verdict.reason === 'EMERGENCY') {
      return this.reply('EMERGENCY', emergencyAnswer(await this.contacts(patientId)), [
        ...this.ref(EMERGENCY_SHEET_ID),
      ]);
    }
    if (verdict.refused && verdict.reason !== 'OFF_TOPIC') {
      return this.reply('REFUSAL', REFUSAL_ANSWERS[verdict.reason]);
    }

    const normalized = normalizeQuestion(question);
    if (isMeasurementQuestion(normalized)) {
      const analysis = await this.insights.engineAnalysis(patientId, periodOf(normalized));
      const rewrite = measurementRewrite(analysis, focusOf(normalized));
      return this.reply('MEASUREMENTS', composeAnswer(rewrite, rewrite.body), [], rewrite);
    }

    // Le filtre de L3-07 ne connaît que le vocabulaire des mesures : une question sur le diabète en
    // général (« C'est quoi l'HbA1c ? ») lui paraît « hors sujet ». Ce sont les fiches qui décident.
    const sheet = bestSheet(this.sheets.available(), question);
    if (sheet) {
      const { text, source, rewrite } = sheetAnswer(sheet, question);
      return this.reply('SHEET', text, [source], rewrite);
    }
    return this.reply(
      'OUT_OF_SCOPE',
      verdict.refused ? ASSISTANT_TEMPLATES.offTopic : ASSISTANT_TEMPLATES.noSafeAnswer,
    );
  }

  private reply(
    kind: AssistantAnswer['kind'],
    text: string,
    sources: KnowledgeSheetRef[] = [],
    rewrite?: AnswerRewrite,
  ): AssistantAnswer {
    return { kind, text, sources, rephrased: false, ...(rewrite ? { rewrite } : {}) };
  }

  /** Référence d'une fiche servie (aucune si elle n'est pas servie, par exemple un brouillon en production). */
  private ref(id: string): KnowledgeSheetRef[] {
    const sheet = this.sheets.available().find((s) => s.sheet.id === id)?.sheet;
    return sheet ? [{ id: sheet.id, title: sheet.title, status: sheet.status }] : [];
  }

  /** Numéro d'urgence, proche et médecin enregistrés par le patient (contacts complets seulement). */
  private async contacts(patientId: string): Promise<EmergencyContacts> {
    const profile = await this.prisma.patientProfile.findUnique({
      where: { userId: patientId },
      select: {
        emergencyNumber: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        doctorName: true,
        doctorPhone: true,
      },
    });
    return {
      emergencyNumber: profile?.emergencyNumber ?? null,
      relative:
        profile?.emergencyContactName && profile.emergencyContactPhone
          ? { name: profile.emergencyContactName, phone: profile.emergencyContactPhone }
          : null,
      doctor:
        profile?.doctorName && profile.doctorPhone
          ? { name: profile.doctorName, phone: profile.doctorPhone }
          : null,
    };
  }
}
