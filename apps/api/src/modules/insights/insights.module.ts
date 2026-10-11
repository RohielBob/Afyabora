import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import { createLlmProvider } from './llm/create-provider';
import { InsightWriter } from './llm/insight-writer.service';
import { LLM_PROVIDER } from './llm/llm-provider';

@Module({
  controllers: [InsightsController],
  providers: [
    InsightsService,
    InsightWriter,
    // Fournisseur de modèle de langage choisi par la configuration (null = gabarits seulement).
    { provide: LLM_PROVIDER, inject: [ConfigService], useFactory: createLlmProvider },
  ],
  exports: [InsightsService],
})
export class InsightsModule {}
