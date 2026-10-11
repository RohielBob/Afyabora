-- Journal d'audit des appels au modèle de langage (L3-10). Ajoute UNE table et son index : aucune
-- table existante n'est modifiée. Aucun identifiant de patient ; textes chiffrés par l'API (AES-256-GCM).
-- CreateTable
CREATE TABLE "LlmAuditLog" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "accepted" INTEGER NOT NULL,
    "refused" INTEGER NOT NULL,
    "decisions" TEXT[],
    "inputEncrypted" TEXT NOT NULL,
    "outputEncrypted" TEXT,

    CONSTRAINT "LlmAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LlmAuditLog_createdAt_idx" ON "LlmAuditLog"("createdAt");
