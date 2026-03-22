-- CreateEnum
CREATE TYPE "CapabilityStatus" AS ENUM ('ACTIVE', 'DRAFT', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "BindingType" AS ENUM ('ROUTE', 'PAGE', 'API_ROUTE', 'MCP_TOOL', 'PRISMA_MODEL', 'FILE_GLOB', 'INFRA');

-- CreateTable
CREATE TABLE "Capability" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "userJob" TEXT,
    "synonyms" JSONB,
    "doNotConfuseWith" TEXT,
    "status" "CapabilityStatus" NOT NULL DEFAULT 'DRAFT',
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Capability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapabilityBinding" (
    "id" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "bindingType" "BindingType" NOT NULL,
    "bindingKey" TEXT NOT NULL,
    "notes" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "generated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapabilityBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompiledBrief" (
    "id" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompiledBrief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Capability_slug_key" ON "Capability"("slug");

-- CreateIndex
CREATE INDEX "Capability_parentId_idx" ON "Capability"("parentId");

-- CreateIndex
CREATE INDEX "Capability_status_idx" ON "Capability"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CapabilityBinding_capabilityId_bindingType_bindingKey_key" ON "CapabilityBinding"("capabilityId", "bindingType", "bindingKey");

-- CreateIndex
CREATE INDEX "CapabilityBinding_capabilityId_idx" ON "CapabilityBinding"("capabilityId");

-- CreateIndex
CREATE INDEX "CapabilityBinding_bindingType_bindingKey_idx" ON "CapabilityBinding"("bindingType", "bindingKey");

-- CreateIndex
CREATE UNIQUE INDEX "CompiledBrief_format_mode_key" ON "CompiledBrief"("format", "mode");

-- AddForeignKey
ALTER TABLE "Capability" ADD CONSTRAINT "Capability_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Capability"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityBinding" ADD CONSTRAINT "CapabilityBinding_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
