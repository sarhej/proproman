-- CreateEnum
CREATE TYPE "AtlasCuratorProposalType" AS ENUM ('TOPIC_LAYER_PATCH', 'LINK_PROPOSAL', 'GAP_REPORT');
CREATE TYPE "AtlasCuratorProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "ArchitectureTopic" ADD COLUMN "lockedFields" JSONB;

-- CreateTable
CREATE TABLE "AtlasCuratorProposal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "proposalType" "AtlasCuratorProposalType" NOT NULL,
    "status" "AtlasCuratorProposalStatus" NOT NULL DEFAULT 'PENDING',
    "architectureTopicId" TEXT,
    "fieldPath" TEXT,
    "currentValue" JSONB,
    "proposedValue" JSONB NOT NULL,
    "sources" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdByAgent" TEXT NOT NULL,
    "reviewReason" TEXT,
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtlasCuratorProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AtlasCuratorProposal_tenantId_status_idx" ON "AtlasCuratorProposal"("tenantId", "status");
CREATE INDEX "AtlasCuratorProposal_architectureTopicId_idx" ON "AtlasCuratorProposal"("architectureTopicId");

ALTER TABLE "AtlasCuratorProposal" ADD CONSTRAINT "AtlasCuratorProposal_architectureTopicId_fkey" FOREIGN KEY ("architectureTopicId") REFERENCES "ArchitectureTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
