import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useObjectUrl } from "./useObjectUrl";

describe("useObjectUrl", () => {
  const createObjectURL = vi.fn();
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    createObjectURL.mockReset().mockImplementation(() => `blob:mock-${createObjectURL.mock.calls.length}`);
    revokeObjectURL.mockReset();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a fresh URL for a file and revokes on unmount", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });
    const { result, unmount, rerender } = renderHook(
      ({ blob }: { blob: File | null }) => useObjectUrl(blob),
      { initialProps: { blob: file } }
    );

    await waitFor(() => {
      expect(result.current).toMatch(/^blob:mock-/);
    });
    expect(createObjectURL).toHaveBeenCalledWith(file);

    rerender({ blob: null });
    await waitFor(() => {
      expect(result.current).toBeNull();
    });
    expect(revokeObjectURL).toHaveBeenCalled();

    unmount();
  });

  it("recreates URL after Strict-Mode style remount revoke", async () => {
    const file = new File([new Uint8Array([9])], "b.png", { type: "image/png" });
    const { result, unmount } = renderHook(() => useObjectUrl(file));

    await waitFor(() => expect(result.current).toBeTruthy());
    const first = result.current;

    // Simulate Strict Mode: cleanup revokes, effect runs again with a new URL
    unmount();
    const second = renderHook(() => useObjectUrl(file));
    await waitFor(() => expect(second.result.current).toBeTruthy());
    expect(second.result.current).not.toBe(first);
    expect(createObjectURL.mock.calls.length).toBeGreaterThanOrEqual(2);
    second.unmount();
  });
});
