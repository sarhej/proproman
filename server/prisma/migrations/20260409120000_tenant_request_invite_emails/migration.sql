-- AlterTable
ALTER TABLE "TenantRequest" ADD COLUMN "inviteEmails" JSONB,
ADD COLUMN "trustCompanyDomain" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "trustedEmailDomain" TEXT;
