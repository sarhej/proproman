import { describe, expect, it, vi, beforeEach } from "vitest";
import { UserRole } from "@prisma/client";
import { E1_PRIMARY_TO_EMAIL, getSuperAdminEmailsOrdered, layoutE1Recipients } from "./transactionalRecipients.js";

vi.mock("../db.js", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "../db.js";

const mockFindMany = prisma.user.findMany as ReturnType<typeof vi.fn>;

describe("transactionalRecipients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("layoutE1Recipients uses primary as To when present", () => {
    const layout = layoutE1Recipients(["a@x.com", E1_PRIMARY_TO_EMAIL, "b@x.com"]);
    expect(layout?.to.toLowerCase()).toBe(E1_PRIMARY_TO_EMAIL);
    expect(layout?.cc.map((e) => e.toLowerCase()).sort()).toEqual(["a@x.com", "b@x.com"].sort());
  });

  it("layoutE1Recipients uses first as To when primary absent", () => {
    const layout = layoutE1Recipients(["first@test.local", "second@test.local"]);
    expect(layout?.to).toBe("first@test.local");
    expect(layout?.cc).toEqual(["second@test.local"]);
  });

  it("layoutE1Recipients returns null for empty list", () => {
    expect(layoutE1Recipients([])).toBeNull();
  });

  it("getSuperAdminEmailsOrdered dedupes and preserves creation order", async () => {
    mockFindMany.mockResolvedValue([
      { email: "A@x.com" },
      { email: "a@x.com" },
      { email: "b@x.com" },
    ]);
    const emails = await getSuperAdminEmailsOrdered();
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: UserRole.SUPER_ADMIN, isActive: true },
        orderBy: { createdAt: "asc" },
      })
    );
    expect(emails).toEqual(["A@x.com", "b@x.com"]);
  });
});
