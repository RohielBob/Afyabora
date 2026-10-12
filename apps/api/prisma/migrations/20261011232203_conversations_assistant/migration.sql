-- Conversations de l'assistant « Afyabora » (L9-05, contrat 0.4.0, ADR-0005 complétée le 2026-10-11).
-- AJOUTE trois types et deux tables ; aucune table existante n'est modifiée. Textes des messages et début
-- de la première question CHIFFRÉS par l'API (AES-256-GCM). Effacement en cascade avec le profil du patient.
-- CreateEnum
CREATE TYPE "AssistantMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "AssistantMessageStatus" AS ENUM ('PENDING', 'READY');

-- CreateEnum
CREATE TYPE "AssistantAnswerKind" AS ENUM ('MEASUREMENTS', 'SHEET', 'REFUSAL', 'EMERGENCY', 'OUT_OF_SCOPE');

-- CreateTable
CREATE TABLE "AssistantConversation" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "previewEncrypted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantMessage" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "role" "AssistantMessageRole" NOT NULL,
    "status" "AssistantMessageStatus" NOT NULL,
    "kind" "AssistantAnswerKind",
    "textEncrypted" TEXT,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "rephrased" BOOLEAN NOT NULL DEFAULT false,
    "questionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantConversation_patientId_updatedAt_idx" ON "AssistantConversation"("patientId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantMessage_questionId_key" ON "AssistantMessage"("questionId");

-- CreateIndex
CREATE INDEX "AssistantMessage_conversationId_createdAt_idx" ON "AssistantMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantMessage_patientId_role_createdAt_idx" ON "AssistantMessage"("patientId", "role", "createdAt");

-- AddForeignKey
ALTER TABLE "AssistantConversation" ADD CONSTRAINT "AssistantConversation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
