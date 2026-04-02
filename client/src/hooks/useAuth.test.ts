import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAuth } from "./useAuth";
import { api } from "../lib/api";
import type { User } from "../types/models";

vi.mock("../lib/api", () => ({
  api: {
    getMe: vi.fn(),
  },
}));

const mockGetMe = vi.mocked(api.getMe);

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears loading and user after 401 (logged out — normal for /t/… entry)", async () => {
    mockGetMe.mockRejectedValue(Object.assign(new Error("Unauthorized"), { status: 401 }));

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.activeTenant).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("clears loading and sets error message on non-401 failure", async () => {
    mockGetMe.mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }));

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it("loads user and tenant on success", async () => {
    const user = { id: "u1", email: "a@b.c", name: "A", role: "EDITOR" as const, isActive: true };
    mockGetMe.mockResolvedValue({
      user: user as User,
      activeTenant: { id: "t1", name: "T", slug: "t", status: "ACTIVE", isSystem: false },
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.id).toBe("u1");
    expect(result.current.activeTenant?.slug).toBe("t");
    expect(result.current.error).toBeNull();
  });
});
