import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AttachmentKind, AttachmentStatus, MembershipRole, UserRole } from "@prisma/client";
import { LocalAttachmentStorage } from "../attachments/localStorage.js";
import { setAttachmentStorageForTests } from "../attachments/storageFactory.js";

const WEBM_HDR = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00]);

const hoisted = vi.hoisted(() => ({
  attachmentCreate: vi.fn(),
  attachmentUpdate: vi.fn(),
  attachmentDelete: vi.fn(),
  attachmentLinkCreate: vi.fn(),
  attachmentLinkCount: vi.fn(),
  logAudit: vi.fn(),
  membershipRole: "OWNER" as string,
  speechConfigured: true,
  transcribe: vi.fn()
}));

vi.mock("../db.js", () => ({
  prisma: {
    attachment: {
      create: (...args: unknown[]) => hoisted.attachmentCreate(...args),
      update: (...args: unknown[]) => hoisted.attachmentUpdate(...args),
      delete: (...args: unknown[]) => hoisted.attachmentDelete(...args)
    },
    attachmentLink: {
      create: (...args: unknown[]) => hoisted.attachmentLinkCreate(...args),
      count: (...args: unknown[]) => hoisted.attachmentLinkCount(...args)
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
  })
}));

vi.mock("../speech/whisperClient.js", () => ({
  isSpeechSttConfigured: () => hoisted.speechConfigured,
  transcribeWithWhisper: (...args: unknown[]) => hoisted.transcribe(...args)
}));

import { voiceRouter } from "./voice.js";

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
  app.use("/api/voice", voiceRouter);
  return app;
}

describe("voice HTTP", () => {
  let tmp: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "voice-http-"));
    setAttachmentStorageForTests(new LocalAttachmentStorage(tmp));
    hoisted.speechConfigured = true;
    hoisted.attachmentLinkCount.mockResolvedValue(0);
    hoisted.transcribe.mockResolvedValue({ text: "hello from whisper", language: "en" });
  });

  afterEach(async () => {
    setAttachmentStorageForTests(null);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("GET /status reports enabled from speech config", async () => {
    const res = await request(makeApp()).get("/api/voice/status");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: true });

    hoisted.speechConfigured = false;
    const off = await request(makeApp()).get("/api/voice/status");
    expect(off.body).toEqual({ enabled: false });
  });

  it("POST /transcribe returns transcript without persisting", async () => {
    const res = await request(makeApp())
      .post("/api/voice/transcribe")
      .attach("file", WEBM_HDR, { filename: "clip.webm", contentType: "audio/webm" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ transcript: "hello from whisper", language: "en" });
    expect(hoisted.attachmentCreate).not.toHaveBeenCalled();
  });

  it("POST /transcribe returns 503 when speech is off", async () => {
    hoisted.speechConfigured = false;
    const res = await request(makeApp())
      .post("/api/voice/transcribe")
      .attach("file", WEBM_HDR, { filename: "clip.webm", contentType: "audio/webm" });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("SPEECH_NOT_CONFIGURED");
  });

  it("POST /capture stores audio ORIGINAL + transcript DERIVATIVE and links", async () => {
    let seq = 0;
    hoisted.attachmentCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      seq += 1;
      const id = seq === 1 ? "audio-1" : "txt-1";
      return {
        id,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    });
    hoisted.attachmentUpdate.mockImplementation(async ({ where, data }: { where: { id: string }; data: object }) => ({
      id: where.id,
      filename: where.id === "audio-1" ? "note.webm" : "note-transcript.txt",
      mimeType: where.id === "audio-1" ? "audio/webm" : "text/plain",
      byteSize: 8,
      checksum: "x",
      storageKey: (data as { storageKey?: string }).storageKey ?? "k",
      source: where.id === "audio-1" ? "UPLOAD" : "AGENT",
      kind: where.id === "audio-1" ? AttachmentKind.ORIGINAL : AttachmentKind.DERIVATIVE,
      parentAttachmentId: where.id === "txt-1" ? "audio-1" : null,
      status: AttachmentStatus.ACTIVE,
      createdByUserId: "u1",
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    hoisted.attachmentLinkCreate
      .mockResolvedValueOnce({ id: "link-audio", attachmentId: "audio-1" })
      .mockResolvedValueOnce({ id: "link-txt", attachmentId: "txt-1" });

    const res = await request(makeApp())
      .post("/api/voice/capture")
      .field("featureId", "feat-1")
      .field("transcript", "edited transcript")
      .attach("file", WEBM_HDR, { filename: "note.webm", contentType: "audio/webm" });

    expect(res.status).toBe(201);
    expect(res.body.transcript).toBe("edited transcript");
    expect(res.body.audio.attachment.id).toBe("audio-1");
    expect(res.body.transcriptAttachment.attachment.id).toBe("txt-1");
    expect(hoisted.transcribe).not.toHaveBeenCalled();
    expect(hoisted.attachmentCreate).toHaveBeenCalledTimes(2);
    expect(hoisted.attachmentLinkCreate).toHaveBeenCalledTimes(2);
  });
});
