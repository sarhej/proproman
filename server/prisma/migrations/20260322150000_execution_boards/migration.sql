-- CreateEnum
CREATE TYPE "TopLevelItemType" AS ENUM ('PRODUCT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "BoardProvider" AS ENUM ('INTERNAL', 'TRELLO', 'JIRA', 'NOTION');

-- CreateEnum
CREATE TYPE "BoardSyncState" AS ENUM ('HEALTHY', 'ERROR', 'DISCONNECTED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "itemType" "TopLevelItemType" NOT NULL DEFAULT 'PRODUCT';

-- CreateTable
CREATE TABLE "ExecutionBoard" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "BoardProvider" NOT NULL DEFAULT 'INTERNAL',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "syncState" "BoardSyncState" NOT NULL DEFAULT 'HEALTHY',
    "externalRef" TEXT,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionColumn" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "mappedStatus" "TaskStatus" NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionColumn_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Requirement" ADD COLUMN "executionColumnId" TEXT;

-- CreateIndex
CREATE INDEX "ExecutionBoard_productId_idx" ON "ExecutionBoard"("productId");

-- CreateIndex
CREATE INDEX "ExecutionColumn_boardId_idx" ON "ExecutionColumn"("boardId");

-- CreateIndex
CREATE INDEX "Requirement_executionColumnId_idx" ON "Requirement"("executionColumnId");

-- AddForeignKey
ALTER TABLE "ExecutionBoard" ADD CONSTRAINT "ExecutionBoard_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionColumn" ADD CONSTRAINT "ExecutionColumn_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "ExecutionBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_executionColumnId_fkey" FOREIGN KEY ("executionColumnId") REFERENCES "ExecutionColumn"("id") ON DELETE SET NULL ON UPDATE CASCADE;
