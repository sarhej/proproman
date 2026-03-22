-- AlterTable
ALTER TABLE "Requirement" ADD COLUMN "executionSortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Requirement_executionColumnId_executionSortOrder_idx" ON "Requirement"("executionColumnId", "executionSortOrder");
