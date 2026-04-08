import { describe, expect, it, vi, beforeEach } from "vitest";
import { UserRole } from "@prisma/client";

const { mockFindUnique, mockUpdate } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("../db.js", () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
  },
}));

import { applyWorkspaceInviteSideEffects } from "./workspaceInviteSideEffects.js";

describe("applyWorkspaceInviteSideEffects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({});
  });

  it("promotes PENDING to VIEWER and sets activeTenantId when null", async () => {
    mockFindUnique.mockResolvedValue({ role: UserRole.PENDING, activeTenantId: null });
    await applyWorkspaceInviteSideEffects("u1", "t1");
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { role: UserRole.VIEWER, activeTenantId: "t1" },
    });
  });

  it("does not change role when already non-PENDING", async () => {
    mockFindUnique.mockResolvedValue({ role: UserRole.ADMIN, activeTenantId: null });
    await applyWorkspaceInviteSideEffects("u1", "t1");
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { activeTenantId: "t1" },
    });
  });

  it("no-op when user missing", async () => {
    mockFindUnique.mockResolvedValue(null);
    await applyWorkspaceInviteSideEffects("u1", "t1");
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
