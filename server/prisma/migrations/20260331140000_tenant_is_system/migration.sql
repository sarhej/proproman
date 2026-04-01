-- Platform workspace (Tymio product hub): not deletable, special MCP surface.
ALTER TABLE "Tenant" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;

-- At most one system workspace (constant index expression so only one row qualifies).
CREATE UNIQUE INDEX "Tenant_at_most_one_is_system"
  ON "Tenant" ((1))
  WHERE "isSystem" = true;
