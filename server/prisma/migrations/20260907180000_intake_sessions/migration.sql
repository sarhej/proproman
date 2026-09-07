-- CreateEnum
CREATE TYPE "IntakeMode" AS ENUM ('BUG', 'FEATURE');

-- CreateEnum
CREATE TYPE "IntakeSessionStatus" AS ENUM (
  'CAPTURING',
  'ANALYZING',
  'CLARIFYING',
  'PLAN_READY',
  'DRAFTING',
  'REVIEWING',
  'COMMITTING',
  'COMMITTED',
  'FAILED',
  'ABANDONED'
);

-- CreateTable
CREATE TABLE "IntakeSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "productId" TEXT NOT NULL,
    "mode" "IntakeMode" NOT NULL,
    "status" "IntakeSessionStatus" NOT NULL DEFAULT 'CAPTURING',
    "rawText" TEXT NOT NULL DEFAULT '',
    "rawExcerptHash" TEXT,
    "sourceChannel" TEXT,
    "sourceMeta" JSONB,
    "clarification" JSONB,
    "creationPlan" JSONB,
    "drafts" JSONB,
    "analyzeError" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdById" TEXT,
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntakeSession_tenantId_idx" ON "IntakeSession"("tenantId");

-- CreateIndex
CREATE INDEX "IntakeSession_tenantId_productId_idx" ON "IntakeSession"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "IntakeSession_tenantId_status_idx" ON "IntakeSession"("tenantId", "status");

-- CreateIndex
CREATE INDEX "IntakeSession_createdById_idx" ON "IntakeSession"("createdById");

-- AddForeignKey
ALTER TABLE "IntakeSession" ADD CONSTRAINT "IntakeSession_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeSession" ADD CONSTRAINT "IntakeSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
