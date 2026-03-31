-- CreateEnum
CREATE TYPE "TenantRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "TenantRequest" (
    "id" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "message" TEXT,
    "status" "TenantRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantRequest_slug_key" ON "TenantRequest"("slug");
CREATE UNIQUE INDEX "TenantRequest_tenantId_key" ON "TenantRequest"("tenantId");
CREATE INDEX "TenantRequest_status_idx" ON "TenantRequest"("status");
CREATE INDEX "TenantRequest_contactEmail_idx" ON "TenantRequest"("contactEmail");
