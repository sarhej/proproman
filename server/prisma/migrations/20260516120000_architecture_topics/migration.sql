-- ArchitectureTopic: as-is + to-be cross-cutting narratives for workspace atlas.

CREATE TABLE "ArchitectureTopic" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "asIsSummary" TEXT,
    "toBeSummary" TEXT,
    "synonyms" JSONB,
    "docPaths" JSONB,
    "autoMatchCapabilities" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchitectureTopic_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ArchitectureTopicInitiative" (
    "architectureTopicId" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,

    CONSTRAINT "ArchitectureTopicInitiative_pkey" PRIMARY KEY ("architectureTopicId","initiativeId")
);

CREATE TABLE "ArchitectureTopicCapability" (
    "architectureTopicId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,

    CONSTRAINT "ArchitectureTopicCapability_pkey" PRIMARY KEY ("architectureTopicId","capabilityId")
);

CREATE UNIQUE INDEX "ArchitectureTopic_tenantId_slug_key" ON "ArchitectureTopic"("tenantId", "slug");
CREATE INDEX "ArchitectureTopic_tenantId_idx" ON "ArchitectureTopic"("tenantId");

CREATE INDEX "ArchitectureTopicInitiative_initiativeId_idx" ON "ArchitectureTopicInitiative"("initiativeId");
CREATE INDEX "ArchitectureTopicCapability_capabilityId_idx" ON "ArchitectureTopicCapability"("capabilityId");

ALTER TABLE "ArchitectureTopicInitiative" ADD CONSTRAINT "ArchitectureTopicInitiative_architectureTopicId_fkey" FOREIGN KEY ("architectureTopicId") REFERENCES "ArchitectureTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArchitectureTopicInitiative" ADD CONSTRAINT "ArchitectureTopicInitiative_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArchitectureTopicCapability" ADD CONSTRAINT "ArchitectureTopicCapability_architectureTopicId_fkey" FOREIGN KEY ("architectureTopicId") REFERENCES "ArchitectureTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArchitectureTopicCapability" ADD CONSTRAINT "ArchitectureTopicCapability_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
