-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "StakeholderRole" AS ENUM ('DECISION_MAKER', 'SPONSOR', 'REVIEWER', 'AMBASSADOR', 'LEGAL', 'MEDICAL');

-- CreateEnum
CREATE TYPE "StakeholderType" AS ENUM ('INTERNAL', 'EXTERNAL');

-- AlterTable
ALTER TABLE "Initiative" ADD COLUMN "problemStatement" TEXT,
ADD COLUMN "successCriteria" TEXT;

-- CreateTable
CREATE TABLE "InitiativeMilestone" (
    "id" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'TODO',
    "targetDate" TIMESTAMP(3),
    "ownerId" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InitiativeMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InitiativeKPI" (
    "id" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetValue" TEXT,
    "currentValue" TEXT,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InitiativeKPI_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stakeholder" (
    "id" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "StakeholderRole" NOT NULL,
    "type" "StakeholderType" NOT NULL,
    "organization" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stakeholder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InitiativeMilestone_initiativeId_idx" ON "InitiativeMilestone"("initiativeId");

-- CreateIndex
CREATE INDEX "InitiativeKPI_initiativeId_idx" ON "InitiativeKPI"("initiativeId");

-- CreateIndex
CREATE INDEX "Stakeholder_initiativeId_idx" ON "Stakeholder"("initiativeId");

-- AddForeignKey
ALTER TABLE "InitiativeMilestone" ADD CONSTRAINT "InitiativeMilestone_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitiativeMilestone" ADD CONSTRAINT "InitiativeMilestone_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitiativeKPI" ADD CONSTRAINT "InitiativeKPI_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stakeholder" ADD CONSTRAINT "Stakeholder_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
