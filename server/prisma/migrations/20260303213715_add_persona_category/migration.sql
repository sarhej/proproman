-- CreateEnum
CREATE TYPE "PersonaCategory" AS ENUM ('BUYER', 'USER', 'NONE');

-- AlterTable
ALTER TABLE "Persona" ADD COLUMN     "category" "PersonaCategory" NOT NULL DEFAULT 'NONE';
