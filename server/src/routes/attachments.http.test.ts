import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AttachmentStatus, MembershipRole, UserRole } from "@prisma/client";
import { LocalAttachmentStorage } from "../attachments/localStorage.js";
import { setAttachmentStorageForTests } from "../attachments/storageFactory.js";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const hoisted = vi.hoisted(() => ({
  attachmentCreate: vi.fn(),
  attachmentUpdate: vi.fn(),
  attachmentFindFirst: vi.fn(),
  attachmentFindMany: vi.fn(),
  attachmentDelete: vi.fn(),
  attachmentLinkCreate: vi.fn(),
  attachmentLinkFindFirst: vi.fn(),
  attachmentLinkFindMany: vi.fn(),
  attachmentLinkDelete: vi.fn(),
  attachmentLinkDeleteMany: vi.fn(),
  attachmentLinkCount: vi.fn(),
  attachmentBackupJobCreate: vi.fn(),
  attachmentBackupJobUpdate: vi.fn(),
  attachmentBackupJobFindFirst: vi.fn(),
  attachmentBackupJobFindMany: vi.fn(),
  intakeSessionFindFirst: vi.fn(),
  logAudit: vi.fn(),
  membershipRole: "OWNER" as string
}));

vi.mock("../db.js", () => ({
  prisma: {
    attachment: {
      create: (...args: unknown[]) => hoisted.attachmentCreate(...args),
      update: (...args: unknown[]) => hoisted.attachmentUpdate(...args),
      findFirst: (...args: unknown[]) => hoisted.attachmentFindFirst(...args),
      findMany: (...args: unknown[]) => hoisted.attachmentFindMany(...args),
      delete: (...args: unknown[]) => hoisted.attachmentDelete(...args)
    },
    attachmentLink: {
      create: (...args: unknown[]) => hoisted.attachmentLinkCreate(...args),
      findFirst: (...args: unknown[]) => hoisted.attachmentLinkFindFirst(...args),
      findMany: (...args: unknown[]) => hoisted.attachmentLinkFindMany(...args),
      delete: (...args: unknown[]) => hoisted.attachmentLinkDelete(...args),
      deleteMany: (...args: unknown[]) => hoisted.attachmentLinkDeleteMany(...args),
      count: (...args: unknown[]) => hoisted.attachmentLinkCount(...args)
    },
    attachmentBackupJob: {
      create: (...args: unknown[]) => hoisted.attachmentBackupJobCreate(...args),
      update: (...args: unknown[]) => hoisted.attachmentBackupJobUpdate(...args),
      findFirst: (...args: unknown[]) => hoisted.attachmentBackupJobFindFirst(...args),
      findMany: (...args: unknown[]) => hoisted.attachmentBackupJobFindMany(...args)
    },
    intakeSession: {
      findFirst: (...args: unknown[]) => hoisted.intakeSessionFindFirst(...args)
    }
  }
}));

vi.mock("../services/audit.js", () => ({
  logAudit: (...args: unknown[]) => hoisted.logAudit(...args)
}));

vi.mock("../tenant/tenantContext.js", () => ({
  getTenantContext: () => ({
    tenantId: "tenant-1",
    tenantSlug: "acme",
    schemaName: "tenant_acme",
    membershipRole: hoisted.membershipRole
  }),
  runWithTenant: (_ctx: unknown, fn: () => unknown) => fn()
}));

import { attachmentsRouter } from "./attachments.js";
import { attachmentLinksRouter } from "./attachment-links.js";
import { attachmentBackupsRouter } from "./attachment-backups.js";

function authTenantMiddleware(role: MembershipRole = MembershipRole.OWNER) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    hoisted.membershipRole = role;
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: { id: string; role: UserRole; isActive: boolean } }).user = {
      id: "u1",
      role: UserRole.ADMIN,
      isActive: true
    };
    (req as unknown as { tenantContext: object }).tenantContext = {
      tenantId: "tenant-1",
      tenantSlug: "acme",
      schemaName: "tenant_acme",
      membershipRole: role
    };
    next();
  };
}

function makeApp(role: MembershipRole = MembershipRole.OWNER) {
  const app = express();
  app.use(express.json());
  app.use(authTenantMiddleware(role));
  app.use("/api/attachments", attachmentsRouter);
  app.use("/api/attachment-links", attachmentLinksRouter);
  app.use("/api/attachment-backups", attachmentBackupsRouter);
  return app;
}

describe("attachments HTTP", () => {
  let tmp: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "att-http-"));
    setAttachmentStorageForTests(new LocalAttachmentStorage(tmp));
    hoisted.attachmentLinkCount.mockResolvedValue(0);
  });

  afterEach(async () => {
    setAttachmentStorageForTests(null);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("rejects non-image MIME on upload", async () => {
    const res = await request(makeApp())
      .post("/api/attachments")
      .attach("file", Buffer.from("%PDF-1.4"), { filename: "x.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MIME_REJECTED");
  });

  it("uploads png and stores blob", async () => {
    const created = {
      id: "att1",
      filename: "shot.png",
      mimeType: "image/png",
      byteSize: PNG_1X1.length,
      checksum: "x",
      storageKey: "pending",
      status: AttachmentStatus.PENDING,
      source: "UPLOAD",
      kind: "ORIGINAL"
    };
    hoisted.attachmentCreate.mockResolvedValueOnce(created);
    hoisted.attachmentUpdate.mockResolvedValueOnce({
      ...created,
      storageKey: "tenants/tenant-1/attachments/2026/07/att1/shot.png",
      status: AttachmentStatus.ACTIVE,
      checksum: expect.any(String)
    });

    const res = await request(makeApp())
      .post("/api/attachments")
      .field("filename", "shot.png")
      .attach("file", PNG_1X1, { filename: "shot.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(res.body.attachment.status).toBe(AttachmentStatus.ACTIVE);
    expect(hoisted.attachmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: "tenant-1" })
      })
    );
    expect(hoisted.logAudit).toHaveBeenCalled();
  });

  it("auto-links upload with initiativeId and sets link tenantId", async () => {
    const created = {
      id: "att-init",
      filename: "shot.png",
      mimeType: "image/png",
      byteSize: PNG_1X1.length,
      checksum: "x",
      storageKey: "pending",
      status: AttachmentStatus.PENDING,
      source: "UPLOAD",
      kind: "ORIGINAL",
      tenantId: "tenant-1"
    };
    hoisted.attachmentCreate.mockResolvedValueOnce(created);
    hoisted.attachmentUpdate.mockResolvedValueOnce({
      ...created,
      storageKey: "tenants/tenant-1/attachments/2026/07/att-init/shot.png",
      status: AttachmentStatus.ACTIVE
    });
    hoisted.attachmentLinkCreate.mockResolvedValueOnce({
      id: "link-init",
      attachmentId: "att-init",
      initiativeId: "init-1",
      tenantId: "tenant-1"
    });

    const res = await request(makeApp())
      .post("/api/attachments")
      .field("filename", "shot.png")
      .field("initiativeId", "init-1")
      .attach("file", PNG_1X1, { filename: "shot.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(hoisted.attachmentLinkCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-1",
          initiativeId: "init-1",
          attachmentId: "att-init"
        })
      })
    );
  });

  it("denies upload for VIEWER", async () => {
    const res = await request(makeApp(MembershipRole.VIEWER))
      .post("/api/attachments")
      .attach("file", PNG_1X1, { filename: "shot.png", contentType: "image/png" });
    expect(res.status).toBe(403);
  });

  it("unlink does not delete attachment row", async () => {
    hoisted.attachmentLinkFindFirst.mockResolvedValueOnce({
      id: "link1",
      attachmentId: "att1"
    });
    hoisted.attachmentLinkDelete.mockResolvedValueOnce({});

    const res = await request(makeApp()).delete("/api/attachment-links/link1");
    expect(res.status).toBe(204);
    expect(hoisted.attachmentDelete).not.toHaveBeenCalled();
    expect(hoisted.logAudit).toHaveBeenCalledWith(
      "u1",
      "DELETED",
      "ATTACHMENT_LINK",
      "link1",
      expect.objectContaining({ unlinkOnly: true })
    );
  });

  it("rejects upload linked to unknown intakeSessionId", async () => {
    hoisted.intakeSessionFindFirst.mockResolvedValueOnce(null);
    const res = await request(makeApp())
      .post("/api/attachments")
      .field("intakeSessionId", "missing-session")
      .attach("file", PNG_1X1, { filename: "shot.png", contentType: "image/png" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Intake session not found/i);
    expect(hoisted.attachmentCreate).not.toHaveBeenCalled();
  });

  it("auto-links upload to existing intakeSessionId", async () => {
    hoisted.intakeSessionFindFirst.mockResolvedValueOnce({ id: "sess1" });
    const created = {
      id: "att-sess",
      filename: "shot.png",
      mimeType: "image/png",
      byteSize: PNG_1X1.length,
      checksum: "x",
      storageKey: "pending",
      status: AttachmentStatus.PENDING,
      source: "UPLOAD",
      kind: "ORIGINAL",
      tenantId: "tenant-1"
    };
    hoisted.attachmentCreate.mockResolvedValueOnce(created);
    hoisted.attachmentUpdate.mockResolvedValueOnce({
      ...created,
      storageKey: "tenants/tenant-1/attachments/2026/07/att-sess/shot.png",
      status: AttachmentStatus.ACTIVE
    });
    hoisted.attachmentLinkCreate.mockResolvedValueOnce({
      id: "link-sess",
      attachmentId: "att-sess",
      intakeSessionId: "sess1",
      tenantId: "tenant-1"
    });

    const res = await request(makeApp())
      .post("/api/attachments")
      .field("intakeSessionId", "sess1")
      .attach("file", PNG_1X1, { filename: "shot.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(hoisted.intakeSessionFindFirst).toHaveBeenCalledWith({
      where: { id: "sess1" },
      select: { id: true }
    });
    expect(hoisted.attachmentLinkCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ intakeSessionId: "sess1", tenantId: "tenant-1" })
      })
    );
  });

  it("retire hides from picker list default (ACTIVE only)", async () => {
    hoisted.attachmentFindFirst.mockResolvedValueOnce({
      id: "att1",
      status: AttachmentStatus.ACTIVE
    });
    hoisted.attachmentUpdate.mockResolvedValueOnce({
      id: "att1",
      status: AttachmentStatus.RETIRED
    });
    const retire = await request(makeApp()).post("/api/attachments/att1/retire").send({ reason: "stale" });
    expect(retire.status).toBe(200);

    hoisted.attachmentFindMany.mockResolvedValueOnce([]);
    const list = await request(makeApp()).get("/api/attachments");
    expect(list.status).toBe(200);
    expect(hoisted.attachmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: AttachmentStatus.ACTIVE })
      })
    );
  });

  it("denies retire for MEMBER", async () => {
    const res = await request(makeApp(MembershipRole.MEMBER))
      .post("/api/attachments/att1/retire")
      .send({});
    expect(res.status).toBe(403);
  });

  it("hard delete requires retire first and confirm", async () => {
    hoisted.attachmentFindFirst.mockResolvedValueOnce({
      id: "att1",
      status: AttachmentStatus.ACTIVE,
      storageKey: "k"
    });
    const noConfirm = await request(makeApp()).delete("/api/attachments/att1");
    expect(noConfirm.status).toBe(400);

    hoisted.attachmentFindFirst.mockResolvedValueOnce({
      id: "att1",
      status: AttachmentStatus.ACTIVE,
      storageKey: "k"
    });
    const active = await request(makeApp()).delete("/api/attachments/att1?confirm=1");
    expect(active.status).toBe(400);
  });

  it("link rejects retired attachment", async () => {
    hoisted.attachmentFindFirst.mockReset();
    hoisted.attachmentFindFirst.mockResolvedValue(null);
    hoisted.attachmentLinkCreate.mockReset();
    const res = await request(makeApp())
      .post("/api/attachment-links")
      .send({ attachmentId: "att1", featureId: "f1" });
    expect(res.status).toBe(404);
    expect(hoisted.attachmentLinkCreate).not.toHaveBeenCalled();
  });

  it("links active attachment to feature", async () => {
    hoisted.attachmentFindFirst.mockResolvedValue({
      id: "att1",
      status: AttachmentStatus.ACTIVE
    });
    hoisted.attachmentLinkCount.mockResolvedValue(0);
    hoisted.attachmentLinkFindFirst.mockResolvedValue(null);
    hoisted.attachmentLinkCreate.mockResolvedValue({
      id: "link1",
      attachmentId: "att1",
      featureId: "f1"
    });
    const res = await request(makeApp())
      .post("/api/attachment-links")
      .send({ attachmentId: "att1", featureId: "f1" });
    expect(res.status).toBe(201);
    expect(res.body.attachmentLink.id).toBe("link1");
    expect(hoisted.attachmentLinkCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-1",
          attachmentId: "att1",
          featureId: "f1"
        })
      })
    );
  });

  it("creates backup manifest job", async () => {
    const job = {
      id: "job1",
      status: "PENDING",
      createdByUserId: "u1"
    };
    hoisted.attachmentBackupJobCreate.mockResolvedValueOnce(job);
    hoisted.attachmentBackupJobUpdate
      .mockResolvedValueOnce({ ...job, status: "RUNNING" })
      .mockResolvedValueOnce({
        ...job,
        status: "SUCCEEDED",
        manifestStorageKey: "tenants/tenant-1/attachment-backups/job1/manifest.json",
        byteSize: 100
      });
    hoisted.attachmentFindMany.mockResolvedValueOnce([
      {
        id: "att1",
        filename: "a.png",
        mimeType: "image/png",
        byteSize: 10,
        checksum: "abc",
        storageKey: "k",
        source: "UPLOAD",
        kind: "ORIGINAL",
        parentAttachmentId: null,
        status: "ACTIVE",
        createdByUserId: "u1",
        createdAt: new Date("2026-07-16T00:00:00Z"),
        links: []
      }
    ]);

    const res = await request(makeApp()).post("/api/attachment-backups").send({});
    expect(res.status).toBe(201);
    expect(res.body.job.status).toBe("SUCCEEDED");
    expect(res.body.contentPath).toContain("/manifest");
  });

  it("denies backup for MEMBER", async () => {
    const res = await request(makeApp(MembershipRole.MEMBER)).post("/api/attachment-backups").send({});
    expect(res.status).toBe(403);
  });
});
