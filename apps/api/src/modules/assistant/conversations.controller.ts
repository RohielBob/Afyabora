import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  assistantListQuerySchema,
  createAssistantConversationSchema,
  sendAssistantMessageSchema,
  type AssistantListQuery,
  type CreateAssistantConversationInput,
  type SendAssistantMessageInput,
} from '@glyka/shared';
import { uuidParam } from '../../common/data/owned-records';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ConversationsService } from './conversations.service';

/** Identifiant de conversation dans l'URL : un UUID, sinon 400 au même format que les autres erreurs. */
const CONVERSATION_ID = uuidParam();

/**
 * Conversations avec l'assistant « Afyabora » (L9-05, contrat 0.4.0). Réservées au PATIENT : le médecin
 * n'y a jamais accès. Aucune logique ici : validation (schémas de @glyka/shared) puis ConversationsService.
 */
@ApiTags('assistant')
@ApiBearerAuth()
@Controller('assistant/conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  @Roles('PATIENT')
  @ApiOperation({ summary: 'Lister mes conversations avec l’assistant (L9-05)' })
  @ApiOkResponse({ description: 'Une page de conversations, la plus récente d’abord' })
  @ApiBadRequestResponse({ description: 'Paramètres invalides (taille de page, curseur)' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(assistantListQuerySchema)) query: AssistantListQuery,
  ) {
    return this.conversations.list(user.id, query);
  }

  /** 201 si la conversation est créée ; 200 si elle existait déjà avec cet identifiant (rejeu). */
  @Post()
  @Roles('PATIENT')
  @ApiOperation({
    summary: 'Commencer une conversation (identifiant créé sur le téléphone) (L9-05)',
  })
  @ApiCreatedResponse({ description: 'Conversation créée (vide)' })
  @ApiOkResponse({ description: 'Déjà créée avec cet identifiant : aucune création' })
  @ApiBadRequestResponse({ description: 'Données invalides, ou profil médical pas encore créé' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiConflictResponse({ description: 'Identifiant déjà utilisé' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createAssistantConversationSchema))
    body: CreateAssistantConversationInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { conversation, created } = await this.conversations.create(user.id, body);
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return conversation;
  }

  @Delete()
  @Roles('PATIENT')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Effacer toutes mes conversations (L9-05)' })
  @ApiNoContentResponse({ description: 'Toutes les conversations sont effacées (effacement réel)' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  async removeAll(@CurrentUser() user: AuthUser): Promise<void> {
    await this.conversations.removeAll(user.id);
  }

  @Get(':id')
  @Roles('PATIENT')
  @ApiOperation({ summary: 'Lire une conversation et ses messages (L9-05)' })
  @ApiOkResponse({ description: 'La conversation, messages du plus ancien au plus récent' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiNotFoundResponse({ description: 'Conversation introuvable' })
  get(@CurrentUser() user: AuthUser, @Param('id', CONVERSATION_ID) id: string) {
    return this.conversations.get(user.id, id);
  }

  @Delete(':id')
  @Roles('PATIENT')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Effacer une conversation (L9-05)' })
  @ApiNoContentResponse({ description: 'Conversation effacée (effacement réel)' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiNotFoundResponse({ description: 'Conversation introuvable ou déjà effacée' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', CONVERSATION_ID) id: string,
  ): Promise<void> {
    await this.conversations.remove(user.id, id);
  }

  /** 202 à la première réception ; 200 au rejeu de la même question. */
  @Post(':id/messages')
  @Roles('PATIENT')
  @ApiOperation({ summary: 'Poser une question à l’assistant (L9-05)' })
  @ApiAcceptedResponse({ description: 'Question enregistrée, avec sa réponse' })
  @ApiOkResponse({ description: 'Question déjà reçue avec cet identifiant (rejeu)' })
  @ApiBadRequestResponse({ description: 'Question invalide (2 à 500 caractères)' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiNotFoundResponse({ description: 'Conversation introuvable' })
  @ApiConflictResponse({ description: 'Identifiant de message déjà utilisé (MESSAGE_ID_CONFLICT)' })
  @ApiTooManyRequestsResponse({ description: 'Plus de 20 questions en une heure' })
  async send(
    @CurrentUser() user: AuthUser,
    @Param('id', CONVERSATION_ID) id: string,
    @Body(new ZodValidationPipe(sendAssistantMessageSchema)) body: SendAssistantMessageInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { response, created } = await this.conversations.send(user.id, id, body);
    res.status(created ? HttpStatus.ACCEPTED : HttpStatus.OK);
    return response;
  }
}
