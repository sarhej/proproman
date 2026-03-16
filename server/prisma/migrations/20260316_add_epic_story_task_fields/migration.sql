-- CreateEnum
CREATE TYPE "StoryType" AS ENUM ('FUNCTIONAL', 'BUG', 'TECH_DEBT', 'RESEARCH');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('TASK', 'SPIKE', 'QA', 'DESIGN');

-- AlterTable Feature: add acceptanceCriteria, storyPoints, storyType
ALTER TABLE "Feature" ADD COLUMN IF NOT EXISTS "acceptanceCriteria" TEXT;
ALTER TABLE "Feature" ADD COLUMN IF NOT EXISTS "storyPoints" INTEGER;
ALTER TABLE "Feature" ADD COLUMN IF NOT EXISTS "storyType" "StoryType";

-- AlterTable Requirement: add task workflow fields and metadata
ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "assigneeId" TEXT;
ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "estimate" TEXT;
ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "labels" JSONB;
ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "taskType" "TaskType";
ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "blockedReason" TEXT;
ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "externalRef" TEXT;
ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill: existing isDone = true -> status = DONE
UPDATE "Requirement" SET "status" = 'DONE' WHERE "isDone" = true;

-- CreateIndex Requirement assigneeId for FK lookups
CREATE INDEX IF NOT EXISTS "Requirement_assigneeId_idx" ON "Requirement"("assigneeId");

-- AddForeignKey Requirement -> User (assignee)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Requirement_assigneeId_fkey'
  ) THEN
    ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_assigneeId_fkey"
      FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
