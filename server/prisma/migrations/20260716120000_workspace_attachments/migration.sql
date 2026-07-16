-- CreateEnum
CREATE TYPE "AttachmentSource" AS ENUM ('UPLOAD', 'PASTE', 'AGENT', 'URL_FETCH', 'BACKUP_RESTORE');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('ORIGINAL', 'ANNOTATED', 'DERIVATIVE');

-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'ACTIVE', 'RETIRED', 'PURGED');

-- CreateEnum
CREATE TYPE "AttachmentLinkRole" AS ENUM ('EVIDENCE', 'DESCRIPTION', 'OTHER');

-- CreateEnum
CREATE TYPE "AttachmentBackupJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "source" "AttachmentSource" NOT NULL DEFAULT 'UPLOAD',
    "kind" "AttachmentKind" NOT NULL DEFAULT 'ORIGINAL',
    "parentAttachmentId" TEXT,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "retiredAt" TIMESTAMP(3),
    "retiredByUserId" TEXT,
    "retireReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttachmentLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "attachmentId" TEXT NOT NULL,
    "featureId" TEXT,
    "requirementId" TEXT,
    "initiativeId" TEXT,
    "demandId" TEXT,
    "intakeSessionId" TEXT,
    "role" "AttachmentLinkRole" NOT NULL DEFAULT 'EVIDENCE',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttachmentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttachmentBackupJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "status" "AttachmentBackupJobStatus" NOT NULL DEFAULT 'PENDING',
    "manifestStorageKey" TEXT,
    "archiveStorageKey" TEXT,
    "filterJson" JSONB,
    "byteSize" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttachmentBackupJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attachment_tenantId_idx" ON "Attachment"("tenantId");

-- CreateIndex
CREATE INDEX "Attachment_tenantId_status_idx" ON "Attachment"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Attachment_checksum_idx" ON "Attachment"("checksum");

-- CreateIndex
CREATE INDEX "Attachment_parentAttachmentId_idx" ON "Attachment"("parentAttachmentId");

-- CreateIndex
CREATE INDEX "Attachment_createdByUserId_idx" ON "Attachment"("createdByUserId");

-- CreateIndex
CREATE INDEX "AttachmentLink_tenantId_idx" ON "AttachmentLink"("tenantId");

-- CreateIndex
CREATE INDEX "AttachmentLink_attachmentId_idx" ON "AttachmentLink"("attachmentId");

-- CreateIndex
CREATE INDEX "AttachmentLink_featureId_idx" ON "AttachmentLink"("featureId");

-- CreateIndex
CREATE INDEX "AttachmentLink_requirementId_idx" ON "AttachmentLink"("requirementId");

-- CreateIndex
CREATE INDEX "AttachmentLink_initiativeId_idx" ON "AttachmentLink"("initiativeId");

-- CreateIndex
CREATE INDEX "AttachmentLink_demandId_idx" ON "AttachmentLink"("demandId");

-- CreateIndex
CREATE INDEX "AttachmentLink_intakeSessionId_idx" ON "AttachmentLink"("intakeSessionId");

-- CreateIndex
CREATE INDEX "AttachmentBackupJob_tenantId_idx" ON "AttachmentBackupJob"("tenantId");

-- CreateIndex
CREATE INDEX "AttachmentBackupJob_tenantId_status_idx" ON "AttachmentBackupJob"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_retiredByUserId_fkey" FOREIGN KEY ("retiredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_parentAttachmentId_fkey" FOREIGN KEY ("parentAttachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttachmentLink" ADD CONSTRAINT "AttachmentLink_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttachmentLink" ADD CONSTRAINT "AttachmentLink_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttachmentLink" ADD CONSTRAINT "AttachmentLink_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttachmentLink" ADD CONSTRAINT "AttachmentLink_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttachmentLink" ADD CONSTRAINT "AttachmentLink_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "Demand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttachmentLink" ADD CONSTRAINT "AttachmentLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttachmentBackupJob" ADD CONSTRAINT "AttachmentBackupJob_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
