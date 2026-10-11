import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

/** Assistant de conversation « Afyabora » (lot L9, ADR-0005 complétée le 2026-10-11). */
@Module({
  controllers: [ConversationsController],
  providers: [ConversationsService],
})
export class AssistantModule {}
