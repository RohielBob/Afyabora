import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import { createLlmProvider } from './llm/create-provider';
import { InsightWriter } from './llm/insight-writer.service';
import { LlmAuditService } from './llm/llm-audit.service';
import { LLM_PROVIDER } from './llm/llm-provider';

@Module({
  controllers: [InsightsController],
  providers: [
    InsightsService,
    InsightWriter,
    LlmAuditService, // journal d'audit des appels au modèle (L3-10)
    // Fournisseur de modèle de langage choisi par la configuration (null = gabarits seulement).
    { provide: LLM_PROVIDER, inject: [ConfigService], useFactory: createLlmProvider },
  ],
  // Le modèle et son journal d'audit servent aussi à l'assistant (mise en mots des réponses, L9-07).
  exports: [InsightsService, LLM_PROVIDER, LlmAuditService],
})
export class InsightsModule {}
