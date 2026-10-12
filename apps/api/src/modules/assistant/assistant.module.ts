import { Module } from '@nestjs/common';
import { InsightsModule } from '../insights/insights.module';
import { AnswerWriter } from './answers/answer-writer.service';
import { AssistantResponder } from './answers/assistant-responder.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { SheetsService } from './knowledge/sheets.service';
import { SheetsController } from './sheets.controller';

/** Assistant de conversation « Afyabora » (lot L9, ADR-0005 complétée le 2026-10-11). */
@Module({
  // Analyse des mesures par le moteur (réponses MEASUREMENTS), modèle de langage et journal d'audit (L9-07).
  imports: [InsightsModule],
  controllers: [ConversationsController, SheetsController],
  providers: [ConversationsService, AssistantResponder, AnswerWriter, SheetsService],
})
export class AssistantModule {}
