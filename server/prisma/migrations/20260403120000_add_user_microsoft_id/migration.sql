-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "microsoftId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_microsoftId_key" ON "User"("microsoftId");
