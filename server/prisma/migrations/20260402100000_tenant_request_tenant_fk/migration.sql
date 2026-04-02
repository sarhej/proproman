-- Enforce TenantRequest.tenantId -> Tenant.id so deleting a Tenant cannot leave an APPROVED
-- request pointing at a missing workspace (public /t/:slug would 404 forever).
-- Fails if any row has tenantId set to a non-existent Tenant id — repair those before migrate.
ALTER TABLE "TenantRequest" ADD CONSTRAINT "TenantRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
