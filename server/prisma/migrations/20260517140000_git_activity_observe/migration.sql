-- CreateEnum
CREATE TYPE "GitActivityKind" AS ENUM ('PUSH', 'PULL_REQUEST', 'RELEASE');

-- AlterTable
ALTER TABLE "RepositoryConnection" ADD COLUMN "lastWebhookReceivedAt" TIMESTAMP(3),
ADD COLUMN "lastWebhookEventType" TEXT,
ADD COLUMN "lastWebhookError" TEXT;

-- CreateTable
CREATE TABLE "GitActivity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "repositoryConnectionId" TEXT NOT NULL,
    "kind" "GitActivityKind" NOT NULL,
    "action" TEXT,
    "deliveryId" TEXT,
    "branch" TEXT,
    "title" TEXT,
    "authorLogin" TEXT,
    "externalUrl" TEXT,
    "commitSha" TEXT,
    "prNumber" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GitActivity_tenantId_occurredAt_idx" ON "GitActivity"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "GitActivity_repositoryConnectionId_occurredAt_idx" ON "GitActivity"("repositoryConnectionId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "GitActivity_repositoryConnectionId_deliveryId_key" ON "GitActivity"("repositoryConnectionId", "deliveryId");

-- AddForeignKey
ALTER TABLE "GitActivity" ADD CONSTRAINT "GitActivity_repositoryConnectionId_fkey" FOREIGN KEY ("repositoryConnectionId") REFERENCES "RepositoryConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
