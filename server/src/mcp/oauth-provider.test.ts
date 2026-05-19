import { describe, it, expect, vi, beforeEach } from "vitest";
import { InvalidGrantError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { TymioOAuthProvider } from "./oauth-provider.js";
import { prisma } from "../db.js";

vi.mock("../db.js", () => ({
  prisma: {
    mcpRefreshToken: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  },
}));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    randomUUID: vi.fn(() => "mock-uuid"),
  };
});

describe("TymioOAuthProvider - Refresh Token Rotation", () => {
  let provider: TymioOAuthProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new TymioOAuthProvider();
  });

  it("throws error if refresh token is not found", async () => {
    vi.mocked(prisma.mcpRefreshToken.findUnique).mockResolvedValue(null);

    await expect(
      provider.exchangeRefreshToken(
        { client_id: "client-1" } as any,
        "bad-token"
      )
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it("throws error if client ID does not match", async () => {
    vi.mocked(prisma.mcpRefreshToken.findUnique).mockResolvedValue({
      id: "1",
      token: "good-token",
      clientId: "other-client",
      userId: "user-1",
      scopes: [],
      expiresAt: new Date(Date.now() + 10000),
      usedAt: null,
      familyId: "fam-1",
      createdAt: new Date(),
    });

    await expect(
      provider.exchangeRefreshToken(
        { client_id: "client-1" } as any,
        "good-token"
      )
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it("throws error and deletes token if expired", async () => {
    vi.mocked(prisma.mcpRefreshToken.delete).mockResolvedValue({} as never);
    vi.mocked(prisma.mcpRefreshToken.findUnique).mockResolvedValue({
      id: "1",
      token: "expired-token",
      clientId: "client-1",
      userId: "user-1",
      scopes: [],
      expiresAt: new Date(Date.now() - 10000), // Past
      usedAt: null,
      familyId: "fam-1",
      createdAt: new Date(),
    });

    await expect(
      provider.exchangeRefreshToken(
        { client_id: "client-1" } as any,
        "expired-token"
      )
    ).rejects.toBeInstanceOf(InvalidGrantError);

    expect(prisma.mcpRefreshToken.delete).toHaveBeenCalledWith({
      where: { id: "1" },
    });
  });

  it("detects reuse and revokes entire family (Zero-Trust)", async () => {
    vi.mocked(prisma.mcpRefreshToken.findUnique).mockResolvedValue({
      id: "1",
      token: "stolen-token",
      clientId: "client-1",
      userId: "user-1",
      scopes: [],
      expiresAt: new Date(Date.now() + 10000),
      usedAt: new Date(Date.now() - 300_000),
      familyId: "fam-1",
      createdAt: new Date(),
    });
    vi.mocked(prisma.mcpRefreshToken.findFirst).mockResolvedValue(null);

    await expect(
      provider.exchangeRefreshToken(
        { client_id: "client-1" } as any,
        "stolen-token"
      )
    ).rejects.toBeInstanceOf(InvalidGrantError);

    expect(prisma.mcpRefreshToken.deleteMany).toHaveBeenCalledWith({
      where: { familyId: "fam-1" },
    });
  });

  it("successfully rotates token and issues a new one", async () => {
    vi.mocked(prisma.mcpRefreshToken.findUnique).mockResolvedValue({
      id: "1",
      token: "valid-token",
      clientId: "client-1",
      userId: "user-1",
      scopes: ["mcp:tools"],
      expiresAt: new Date(Date.now() + 10000),
      usedAt: null, // Not used yet
      familyId: "fam-1",
      createdAt: new Date(),
    });

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      role: "ADMIN",
      isActive: true,
    } as any);
    vi.mocked(prisma.mcpRefreshToken.updateMany).mockResolvedValue({ count: 1 });

    const result = await provider.exchangeRefreshToken(
      { client_id: "client-1" } as any,
      "valid-token"
    );

    expect(prisma.mcpRefreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: "1", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });

    expect(prisma.mcpRefreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        token: expect.any(String),
        userId: "user-1",
        clientId: "client-1",
        scopes: ["mcp:tools"],
        familyId: "fam-1",
      }),
    });

    expect(result).toMatchObject({
      access_token: expect.any(String),
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: expect.any(String),
    });
  });
});
