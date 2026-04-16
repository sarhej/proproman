-- CreateEnum
CREATE TYPE "WorkspaceAccessRequestStatus" AS ENUM ('PENDING', 'FULFILLED');

-- CreateTable
CREATE TABLE "WorkspaceAccessRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "WorkspaceAccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceAccessRequest_tenantId_userId_key" ON "WorkspaceAccessRequest"("tenantId", "userId");
CREATE INDEX "WorkspaceAccessRequest_tenantId_idx" ON "WorkspaceAccessRequest"("tenantId");
CREATE INDEX "WorkspaceAccessRequest_userId_idx" ON "WorkspaceAccessRequest"("userId");
CREATE INDEX "WorkspaceAccessRequest_status_idx" ON "WorkspaceAccessRequest"("status");

-- AddForeignKey
ALTER TABLE "WorkspaceAccessRequest" ADD CONSTRAINT "WorkspaceAccessRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceAccessRequest" ADD CONSTRAINT "WorkspaceAccessRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
