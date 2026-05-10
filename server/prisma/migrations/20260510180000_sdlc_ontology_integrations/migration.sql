-- CreateEnum
CREATE TYPE "AffectedEnvironment" AS ENUM ('PRODUCTION', 'STAGING', 'LOCAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DeployedToStage" AS ENUM ('NOT_DEPLOYED', 'STAGING', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "WorkArtifactType" AS ENUM ('COMMIT', 'BRANCH', 'PR', 'TAG', 'RELEASE', 'ISSUE');

-- CreateEnum
CREATE TYPE "DesignArtifactProvider" AS ENUM ('FIGMA', 'GENERIC_URL', 'CLAUDE_DESIGN');

-- CreateEnum
CREATE TYPE "VcsProvider" AS ENUM ('GITHUB', 'GITLAB');

-- CreateEnum
CREATE TYPE "ReleaseSource" AS ENUM ('MANUAL', 'GITHUB', 'GITLAB');

-- CreateEnum
CREATE TYPE "SecurityTopicCategory" AS ENUM ('AUTHN', 'AUTHZ', 'DATA', 'SUPPLY_CHAIN', 'OPS');

-- CreateEnum
CREATE TYPE "SecurityTopicStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'MITIGATED', 'ACCEPTED_RISK');

-- CreateEnum
CREATE TYPE "DemandSignalHint" AS ENUM ('NONE', 'CUSTOMER_REPORT', 'MONITORING', 'PARTNER_SIGNAL', 'INTERNAL');

-- AlterTable
ALTER TABLE "Demand" ADD COLUMN "signalHint" "DemandSignalHint" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "Risk" ADD COLUMN "signalHint" "DemandSignalHint" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "Feature" ADD COLUMN "deployedToStage" "DeployedToStage",
ADD COLUMN "deployedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Requirement" ADD COLUMN "affectedEnvironment" "AffectedEnvironment",
ADD COLUMN "deployedToStage" "DeployedToStage",
ADD COLUMN "deployedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "UseCase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "productId" TEXT,
    "title" TEXT NOT NULL,
    "primaryActor" TEXT,
    "goal" TEXT,
    "preconditions" TEXT,
    "mainFlow" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'P2',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UseCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UseCaseInitiative" (
    "useCaseId" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,

    CONSTRAINT "UseCaseInitiative_pkey" PRIMARY KEY ("useCaseId","initiativeId")
);

-- CreateTable
CREATE TABLE "UseCaseFeature" (
    "useCaseId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,

    CONSTRAINT "UseCaseFeature_pkey" PRIMARY KEY ("useCaseId","featureId")
);

-- CreateTable
CREATE TABLE "SecurityTopic" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "title" TEXT NOT NULL,
    "category" "SecurityTopicCategory" NOT NULL,
    "status" "SecurityTopicStatus" NOT NULL DEFAULT 'PLANNED',
    "description" TEXT,
    "frameworkRef" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityTopicInitiative" (
    "securityTopicId" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,

    CONSTRAINT "SecurityTopicInitiative_pkey" PRIMARY KEY ("securityTopicId","initiativeId")
);

-- CreateTable
CREATE TABLE "SecurityTopicRisk" (
    "securityTopicId" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,

    CONSTRAINT "SecurityTopicRisk_pkey" PRIMARY KEY ("securityTopicId","riskId")
);

-- CreateTable
CREATE TABLE "SecurityTopicPartner" (
    "securityTopicId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,

    CONSTRAINT "SecurityTopicPartner_pkey" PRIMARY KEY ("securityTopicId","partnerId")
);

-- CreateTable
CREATE TABLE "RepositoryConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "provider" "VcsProvider" NOT NULL,
    "baseUrl" TEXT NOT NULL DEFAULT '',
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "displayName" TEXT,
    "oauthAccessToken" TEXT,
    "oauthRefreshToken" TEXT,
    "oauthExpiresAt" TIMESTAMP(3),
    "webhookSecret" TEXT,
    "externalInstallationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepositoryConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkArtifactLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "repositoryConnectionId" TEXT,
    "featureId" TEXT,
    "requirementId" TEXT,
    "artifactType" "WorkArtifactType" NOT NULL,
    "url" TEXT NOT NULL,
    "externalId" TEXT,
    "pinnedRevision" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkArtifactLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignArtifactLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "featureId" TEXT,
    "requirementId" TEXT,
    "provider" "DesignArtifactProvider" NOT NULL,
    "url" TEXT NOT NULL,
    "nodeRef" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignArtifactLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "repositoryConnectionId" TEXT,
    "tag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "notes" TEXT,
    "source" "ReleaseSource" NOT NULL DEFAULT 'MANUAL',
    "externalUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseRequirement" (
    "releaseId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,

    CONSTRAINT "ReleaseRequirement_pkey" PRIMARY KEY ("releaseId","requirementId")
);

-- CreateIndex
CREATE INDEX "UseCase_tenantId_idx" ON "UseCase"("tenantId");

-- CreateIndex
CREATE INDEX "UseCase_productId_idx" ON "UseCase"("productId");

-- CreateIndex
CREATE INDEX "UseCaseInitiative_initiativeId_idx" ON "UseCaseInitiative"("initiativeId");

-- CreateIndex
CREATE INDEX "UseCaseFeature_featureId_idx" ON "UseCaseFeature"("featureId");

-- CreateIndex
CREATE INDEX "SecurityTopic_tenantId_idx" ON "SecurityTopic"("tenantId");

-- CreateIndex
CREATE INDEX "SecurityTopicInitiative_initiativeId_idx" ON "SecurityTopicInitiative"("initiativeId");

-- CreateIndex
CREATE INDEX "SecurityTopicRisk_riskId_idx" ON "SecurityTopicRisk"("riskId");

-- CreateIndex
CREATE INDEX "SecurityTopicPartner_partnerId_idx" ON "SecurityTopicPartner"("partnerId");

-- CreateIndex
CREATE INDEX "RepositoryConnection_tenantId_idx" ON "RepositoryConnection"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryConnection_tenantId_provider_owner_repo_key" ON "RepositoryConnection"("tenantId", "provider", "owner", "repo");

-- CreateIndex
CREATE INDEX "WorkArtifactLink_tenantId_idx" ON "WorkArtifactLink"("tenantId");

-- CreateIndex
CREATE INDEX "WorkArtifactLink_repositoryConnectionId_idx" ON "WorkArtifactLink"("repositoryConnectionId");

-- CreateIndex
CREATE INDEX "WorkArtifactLink_featureId_idx" ON "WorkArtifactLink"("featureId");

-- CreateIndex
CREATE INDEX "WorkArtifactLink_requirementId_idx" ON "WorkArtifactLink"("requirementId");

-- CreateIndex
CREATE INDEX "DesignArtifactLink_tenantId_idx" ON "DesignArtifactLink"("tenantId");

-- CreateIndex
CREATE INDEX "DesignArtifactLink_featureId_idx" ON "DesignArtifactLink"("featureId");

-- CreateIndex
CREATE INDEX "DesignArtifactLink_requirementId_idx" ON "DesignArtifactLink"("requirementId");

-- CreateIndex
CREATE INDEX "Release_tenantId_idx" ON "Release"("tenantId");

-- CreateIndex
CREATE INDEX "Release_repositoryConnectionId_idx" ON "Release"("repositoryConnectionId");

-- CreateIndex
CREATE INDEX "ReleaseRequirement_requirementId_idx" ON "ReleaseRequirement"("requirementId");

-- AddForeignKey
ALTER TABLE "UseCase" ADD CONSTRAINT "UseCase_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UseCaseInitiative" ADD CONSTRAINT "UseCaseInitiative_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UseCaseInitiative" ADD CONSTRAINT "UseCaseInitiative_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UseCaseFeature" ADD CONSTRAINT "UseCaseFeature_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UseCaseFeature" ADD CONSTRAINT "UseCaseFeature_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityTopicInitiative" ADD CONSTRAINT "SecurityTopicInitiative_securityTopicId_fkey" FOREIGN KEY ("securityTopicId") REFERENCES "SecurityTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityTopicInitiative" ADD CONSTRAINT "SecurityTopicInitiative_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityTopicRisk" ADD CONSTRAINT "SecurityTopicRisk_securityTopicId_fkey" FOREIGN KEY ("securityTopicId") REFERENCES "SecurityTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityTopicRisk" ADD CONSTRAINT "SecurityTopicRisk_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityTopicPartner" ADD CONSTRAINT "SecurityTopicPartner_securityTopicId_fkey" FOREIGN KEY ("securityTopicId") REFERENCES "SecurityTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityTopicPartner" ADD CONSTRAINT "SecurityTopicPartner_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkArtifactLink" ADD CONSTRAINT "WorkArtifactLink_repositoryConnectionId_fkey" FOREIGN KEY ("repositoryConnectionId") REFERENCES "RepositoryConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkArtifactLink" ADD CONSTRAINT "WorkArtifactLink_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkArtifactLink" ADD CONSTRAINT "WorkArtifactLink_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignArtifactLink" ADD CONSTRAINT "DesignArtifactLink_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignArtifactLink" ADD CONSTRAINT "DesignArtifactLink_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_repositoryConnectionId_fkey" FOREIGN KEY ("repositoryConnectionId") REFERENCES "RepositoryConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseRequirement" ADD CONSTRAINT "ReleaseRequirement_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseRequirement" ADD CONSTRAINT "ReleaseRequirement_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
