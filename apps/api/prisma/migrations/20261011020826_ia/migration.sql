-- CreateEnum
CREATE TYPE "AiStatus" AS ENUM ('CONCLUIDA', 'FALHA');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('PENDENTE', 'ENVIADO', 'DESCARTADO', 'FALHA');

-- CreateTable
CREATE TABLE "AiAnalysis" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "status" "AiStatus" NOT NULL,
    "intent" TEXT,
    "confidence" DOUBLE PRECISION,
    "summary" TEXT,
    "result" JSONB,
    "action" TEXT,
    "ticketId" TEXT,
    "taskId" TEXT,
    "quoteId" TEXT,
    "error" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiDraft" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'PENDENTE',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,

    CONSTRAINT "AiDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiAnalysis_messageId_key" ON "AiAnalysis"("messageId");

-- CreateIndex
CREATE INDEX "AiDraft_status_idx" ON "AiDraft"("status");

-- AddForeignKey
ALTER TABLE "AiAnalysis" ADD CONSTRAINT "AiAnalysis_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiDraft" ADD CONSTRAINT "AiDraft_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
