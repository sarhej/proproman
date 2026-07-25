import { describe, it, expect } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import request from "supertest";
import { getTenantContext, runWithTenant, type TenantContext } from "./tenantContext.js";
import { multerSingleWithTenant } from "./multerWithTenant.js";

const tenant: TenantContext = {
  tenantId: "tenant-als",
  tenantSlug: "als",
  schemaName: "tenant_als",
  membershipRole: "OWNER"
};

describe("multerWithTenant", () => {
  it("loses ALS without wrapper (documents the bug)", async () => {
    const upload = multer({ storage: multer.memoryStorage() });
    const app = express();
    app.use((_req, _res, next) => {
      runWithTenant(tenant, () => next());
    });
    app.post(
      "/raw",
      (req, res, next) => {
        upload.single("file")(req, res, (err) => {
          if (err) {
            res.status(400).end();
            return;
          }
          next();
        });
      },
      (_req, res) => {
        res.json({ store: getTenantContext()?.tenantId ?? null });
      }
    );
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const res = await request(app).post("/raw").attach("file", png, "a.png");
    expect(res.status).toBe(200);
    expect(res.body.store).toBeNull();
  });

  it("restores ALS after multer via multerSingleWithTenant", async () => {
    const upload = multer({ storage: multer.memoryStorage() });
    const app = express();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.tenantContext = tenant;
      runWithTenant(tenant, () => next());
    });
    app.post(
      "/wrapped",
      multerSingleWithTenant(upload.single("file")),
      (_req, res) => {
        res.json({ store: getTenantContext()?.tenantId ?? null });
      }
    );
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const res = await request(app).post("/wrapped").attach("file", png, "a.png");
    expect(res.status).toBe(200);
    expect(res.body.store).toBe("tenant-als");
  });
});
