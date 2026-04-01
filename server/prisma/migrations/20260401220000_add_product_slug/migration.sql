-- AlterTable
ALTER TABLE "Product" ADD COLUMN "slug" TEXT;

-- Backfill: readable slug from name + id prefix so every row is unique
UPDATE "Product" SET "slug" = (
  CASE
    WHEN TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(REGEXP_REPLACE(TRIM("name"), '[^a-zA-Z0-9]+', '-', 'g')), '-+', '-', 'g')) <> ''
    THEN LEFT(
      TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(REGEXP_REPLACE(TRIM("name"), '[^a-zA-Z0-9]+', '-', 'g')), '-+', '-', 'g')),
      72
    ) || '-' || SUBSTRING("id" FROM 1 FOR 8)
    ELSE 'product-' || SUBSTRING("id" FROM 1 FOR 8)
  END
);

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_slug_key" ON "Product"("tenantId", "slug");
