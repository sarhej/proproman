-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('B2B2C', 'B2G2C', 'INSURER', 'EMPLOYER', 'PUBLIC');

-- CreateEnum
CREATE TYPE "DemandSourceType" AS ENUM ('ACCOUNT', 'PARTNER', 'INTERNAL', 'COMPLIANCE');

-- CreateEnum
CREATE TYPE "DemandStatus" AS ENUM ('NEW', 'VALIDATING', 'APPROVED', 'PLANNED', 'SHIPPED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AssignmentRole" AS ENUM ('ACCOUNTABLE', 'IMPLEMENTER', 'CONSULTED', 'INFORMED');

-- CreateEnum
CREATE TYPE "DateConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('DISCOVERY', 'PILOT', 'CONTRACTING', 'ACTIVE', 'RENEWAL');

-- CreateEnum
CREATE TYPE "StrategicTier" AS ENUM ('TIER_1', 'TIER_2', 'TIER_3');

-- AlterTable
ALTER TABLE "Feature" ADD COLUMN     "dateConfidence" "DateConfidence",
ADD COLUMN     "milestoneDate" TIMESTAMP(3),
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "targetDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Initiative" ADD COLUMN     "arrImpact" DOUBLE PRECISION,
ADD COLUMN     "dateConfidence" "DateConfidence",
ADD COLUMN     "dealStage" "DealStage",
ADD COLUMN     "milestoneDate" TIMESTAMP(3),
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "renewalDate" TIMESTAMP(3),
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "strategicTier" "StrategicTier";

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "priority" "Priority" NOT NULL DEFAULT 'P2',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "segment" TEXT,
    "ownerId" TEXT,
    "arrImpact" DOUBLE PRECISION,
    "renewalDate" TIMESTAMP(3),
    "dealStage" "DealStage",
    "strategicTier" "StrategicTier",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Demand" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceType" "DemandSourceType" NOT NULL,
    "status" "DemandStatus" NOT NULL DEFAULT 'NEW',
    "urgency" INTEGER NOT NULL DEFAULT 3,
    "accountId" TEXT,
    "partnerId" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Demand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandLink" (
    "id" TEXT NOT NULL,
    "demandId" TEXT NOT NULL,
    "initiativeId" TEXT,
    "featureId" TEXT,

    CONSTRAINT "DemandLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InitiativeAssignment" (
    "initiativeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AssignmentRole" NOT NULL,
    "allocation" INTEGER,

    CONSTRAINT "InitiativeAssignment_pkey" PRIMARY KEY ("initiativeId","userId","role")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_name_key" ON "Product"("name");

-- CreateIndex
CREATE INDEX "DemandLink_demandId_idx" ON "DemandLink"("demandId");

-- CreateIndex
CREATE INDEX "DemandLink_initiativeId_idx" ON "DemandLink"("initiativeId");

-- CreateIndex
CREATE INDEX "DemandLink_featureId_idx" ON "DemandLink"("featureId");

-- AddForeignKey
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demand" ADD CONSTRAINT "Demand_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demand" ADD CONSTRAINT "Demand_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demand" ADD CONSTRAINT "Demand_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandLink" ADD CONSTRAINT "DemandLink_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "Demand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandLink" ADD CONSTRAINT "DemandLink_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandLink" ADD CONSTRAINT "DemandLink_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitiativeAssignment" ADD CONSTRAINT "InitiativeAssignment_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitiativeAssignment" ADD CONSTRAINT "InitiativeAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
