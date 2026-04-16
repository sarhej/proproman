import { describe, it, expect, vi, beforeEach } from "vitest";
import { fulfillWorkspaceAccessRequestsForMembership } from "./workspaceAccessRequest.js";

vi.mock("../db.js", () => ({
  prismaUnscoped: {
    workspaceAccessRequest: { updateMany: vi.fn() },
  },
}));

import { prismaUnscoped } from "../db.js";

const mockUpdateMany = prismaUnscoped.workspaceAccessRequest.updateMany as ReturnType<typeof vi.fn>;

describe("fulfillWorkspaceAccessRequestsForMembership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("marks PENDING rows FULFILLED for tenant and user", async () => {
    await fulfillWorkspaceAccessRequestsForMembership("t1", "u1");
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", userId: "u1", status: "PENDING" },
      data: { status: "FULFILLED" },
    });
  });
});
