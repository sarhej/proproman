import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserRole } from "@prisma/client";
import { resolveOrCreateOAuthUser } from "./oauthUserService.js";
import { prisma } from "../db.js";

vi.mock("../db.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn()
    },
    userEmail: {
      findUnique: vi.fn(),
      create: vi.fn()
    }
  }
}));

vi.mock("../services/audit.js", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined)
}));

const mockUser = (overrides: Partial<{ id: string; email: string; googleId: string | null; microsoftId: string | null; isActive: boolean }> = {}) => ({
  id: "u1",
  email: "a@example.com",
  name: "A",
  avatarUrl: null,
  role: UserRole.VIEWER,
  isActive: true,
  lastLoginAt: null,
  googleId: "g1",
  microsoftId: null,
  activeTenantId: null,
  preferredLocale: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

describe("resolveOrCreateOAuthUser (google)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing user by googleId and updates lastLoginAt", async () => {
    const u = mockUser({ googleId: "gid" });
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(u as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(u as never);

    const result = await resolveOrCreateOAuthUser({
      provider: "google",
      providerUserId: "gid",
      email: "a@example.com",
      name: "A"
    });

    expect(result.id).toBe("u1");
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({ lastLoginAt: expect.any(Date) })
      })
    );
  });

  it("throws when user by googleId is inactive", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockUser({ isActive: false }) as never);

    await expect(
      resolveOrCreateOAuthUser({
        provider: "google",
        providerUserId: "gid",
        email: "a@example.com",
        name: "A"
      })
    ).rejects.toThrow(/deactivated/);
  });

  it("links googleId when email matches UserEmail alias", async () => {
    const existing = mockUser({
      id: "u1",
      email: "primary@example.com",
      googleId: null
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.userEmail.findUnique)
      .mockResolvedValueOnce({
        id: "ue1",
        email: "alias@example.com",
        userId: "u1",
        isPrimary: false,
        createdAt: new Date(),
        user: existing
      } as never)
      .mockResolvedValueOnce({ id: "ue1" } as never);

    const linked = mockUser({ id: "u1", googleId: "gid" });
    vi.mocked(prisma.user.update).mockResolvedValueOnce(linked as never);

    const result = await resolveOrCreateOAuthUser({
      provider: "google",
      providerUserId: "gid",
      email: "alias@example.com",
      name: "A"
    });

    expect(result.googleId).toBe("gid");
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({ googleId: "gid" })
      })
    );
  });
});
