-- Multitenancy: control-plane models + tenantId on all business data
-- This migration is safe to run on an existing production database.
-- All new columns are nullable or have defaults to avoid breaking existing rows.

-- 1. Enums for tenant control plane
CREATE TYPE "TenantStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'DEPROVISIONING');
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- 2. Control-plane tables

CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "schemaName" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'PROVISIONING',
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
CREATE UNIQUE INDEX "Tenant_schemaName_key" ON "Tenant"("schemaName");
CREATE INDEX "Tenant_slug_idx" ON "Tenant"("slug");

CREATE TABLE "TenantDomain" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TenantDomain_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantDomain_domain_key" ON "TenantDomain"("domain");
CREATE INDEX "TenantDomain_tenantId_idx" ON "TenantDomain"("tenantId");
CREATE INDEX "TenantDomain_domain_idx" ON "TenantDomain"("domain");

ALTER TABLE "TenantDomain" ADD CONSTRAINT "TenantDomain_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TenantMembership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantMembership_tenantId_userId_key" ON "TenantMembership"("tenantId", "userId");
CREATE INDEX "TenantMembership_tenantId_idx" ON "TenantMembership"("tenantId");
CREATE INDEX "TenantMembership_userId_idx" ON "TenantMembership"("userId");

ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TenantMigrationState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 0,
    "lastMigratedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorLog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TenantMigrationState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantMigrationState_tenantId_key" ON "TenantMigrationState"("tenantId");

ALTER TABLE "TenantMigrationState" ADD CONSTRAINT "TenantMigrationState_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Add activeTenantId to User (control-plane)
ALTER TABLE "User" ADD COLUMN "activeTenantId" TEXT;

-- 4. Add tenantId to all tenant-owned business models
-- All are nullable now so existing rows remain valid; a data migration
-- will backfill them for the default/seed tenant.

ALTER TABLE "Product" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "ExecutionBoard" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "ExecutionColumn" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Domain" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Persona" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "RevenueStream" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Initiative" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "SuccessCriterion" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "InitiativeComment" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Feature" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Requirement" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Decision" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Risk" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Account" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Partner" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Demand" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "DemandLink" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "InitiativeAssignment" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "CampaignLink" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "InitiativeMilestone" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "InitiativeKPI" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Stakeholder" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "AuditEntry" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "NotificationRule" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "UserNotificationSubscription" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "UserNotificationPreference" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "NotificationDelivery" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "UserMessage" ADD COLUMN "tenantId" TEXT;

-- 5. Indexes on tenantId for query performance
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");
CREATE INDEX "ExecutionBoard_tenantId_idx" ON "ExecutionBoard"("tenantId");
CREATE INDEX "ExecutionColumn_tenantId_idx" ON "ExecutionColumn"("tenantId");
CREATE INDEX "Domain_tenantId_idx" ON "Domain"("tenantId");
CREATE INDEX "Persona_tenantId_idx" ON "Persona"("tenantId");
CREATE INDEX "RevenueStream_tenantId_idx" ON "RevenueStream"("tenantId");
CREATE INDEX "Initiative_tenantId_idx" ON "Initiative"("tenantId");
CREATE INDEX "SuccessCriterion_tenantId_idx" ON "SuccessCriterion"("tenantId");
CREATE INDEX "InitiativeComment_tenantId_idx" ON "InitiativeComment"("tenantId");
CREATE INDEX "Feature_tenantId_idx" ON "Feature"("tenantId");
CREATE INDEX "Requirement_tenantId_idx" ON "Requirement"("tenantId");
CREATE INDEX "Decision_tenantId_idx" ON "Decision"("tenantId");
CREATE INDEX "Risk_tenantId_idx" ON "Risk"("tenantId");
CREATE INDEX "Account_tenantId_idx" ON "Account"("tenantId");
CREATE INDEX "Partner_tenantId_idx" ON "Partner"("tenantId");
CREATE INDEX "Demand_tenantId_idx" ON "Demand"("tenantId");
CREATE INDEX "DemandLink_tenantId_idx" ON "DemandLink"("tenantId");
CREATE INDEX "InitiativeAssignment_tenantId_idx" ON "InitiativeAssignment"("tenantId");
CREATE INDEX "Campaign_tenantId_idx" ON "Campaign"("tenantId");
CREATE INDEX "Asset_tenantId_idx" ON "Asset"("tenantId");
CREATE INDEX "CampaignLink_tenantId_idx" ON "CampaignLink"("tenantId");
CREATE INDEX "InitiativeMilestone_tenantId_idx" ON "InitiativeMilestone"("tenantId");
CREATE INDEX "InitiativeKPI_tenantId_idx" ON "InitiativeKPI"("tenantId");
CREATE INDEX "Stakeholder_tenantId_idx" ON "Stakeholder"("tenantId");
CREATE INDEX "AuditEntry_tenantId_idx" ON "AuditEntry"("tenantId");
CREATE INDEX "NotificationRule_tenantId_idx" ON "NotificationRule"("tenantId");

-- 6. Drop old unique constraints that conflict with tenant-scoped uniqueness
-- Product.name was @unique globally, now @unique([tenantId, name])
DROP INDEX IF EXISTS "Product_name_key";
DROP INDEX IF EXISTS "Domain_name_key";
DROP INDEX IF EXISTS "Persona_name_key";
DROP INDEX IF EXISTS "RevenueStream_name_key";

-- Tenant-scoped unique indexes (will be enforced once tenantId is backfilled)
-- These are partial indexes that only apply when tenantId IS NOT NULL
CREATE UNIQUE INDEX "Product_tenantId_name_key" ON "Product"("tenantId", "name") WHERE "tenantId" IS NOT NULL;
CREATE UNIQUE INDEX "Domain_tenantId_name_key" ON "Domain"("tenantId", "name") WHERE "tenantId" IS NOT NULL;
CREATE UNIQUE INDEX "Persona_tenantId_name_key" ON "Persona"("tenantId", "name") WHERE "tenantId" IS NOT NULL;
CREATE UNIQUE INDEX "RevenueStream_tenantId_name_key" ON "RevenueStream"("tenantId", "name") WHERE "tenantId" IS NOT NULL;
