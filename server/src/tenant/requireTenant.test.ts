import { describe, it, expect, vi } from "vitest";
import { requireTenant, getTenantId } from "./requireTenant.js";
import type { Request, Response, NextFunction } from "express";
import type { TenantContext } from "./tenantContext.js";

function mockReq(tenantContext?: TenantContext): Partial<Request> {
  return { tenantContext } as Partial<Request>;
}

function mockRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe("requireTenant middleware", () => {
  it("calls next() when tenantContext is present", () => {
    const req = mockReq({
      tenantId: "t-1",
      tenantSlug: "acme",
      schemaName: "tenant_acme",
      membershipRole: "ADMIN",
    });
    const res = mockRes();
    const next = vi.fn();

    requireTenant(req as Request, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 400 when tenantContext is undefined", () => {
    const req = mockReq(undefined);
    const res = mockRes();
    const next = vi.fn();

    requireTenant(req as Request, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("Tenant context required") })
    );
  });

  it("returns 400 when tenantContext is missing from req entirely", () => {
    const req = {} as Partial<Request>;
    const res = mockRes();
    const next: NextFunction = vi.fn();

    requireTenant(req as Request, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when tenantContext is null", () => {
    const req = { tenantContext: null } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requireTenant(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("getTenantId", () => {
  it("returns tenantId when tenantContext is present", () => {
    const req = mockReq({
      tenantId: "t-123",
      tenantSlug: "acme",
      schemaName: "tenant_acme",
      membershipRole: "MEMBER",
    });
    expect(getTenantId(req as Request)).toBe("t-123");
  });

  it("throws when tenantContext is missing", () => {
    const req = mockReq(undefined);
    expect(() => getTenantId(req as Request)).toThrow("No tenant context on request");
  });

  it("throws when req has no tenantContext property at all", () => {
    const req = {} as Request;
    expect(() => getTenantId(req)).toThrow("No tenant context on request");
  });
});
