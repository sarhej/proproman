import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { useUiSettings } from "./useUiSettings";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: {
    getUiSettings: vi.fn(),
  },
}));

const mockGet = vi.mocked(api.getUiSettings);

function HookProbe({ enabled, workspaceKey }: { enabled: boolean; workspaceKey?: string | null }) {
  const { hiddenNavPaths, loading } = useUiSettings(enabled, workspaceKey ?? undefined);
  return (
    <div>
      <span data-testid="loading">{loading ? "yes" : "no"}</span>
      <span data-testid="paths">{[...hiddenNavPaths].sort().join(",")}</span>
    </div>
  );
}

describe("useUiSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ hiddenNavPaths: ["/gantt"] });
  });

  it("refetches when workspaceKey changes (different tab / workspace target)", async () => {
    const { rerender } = render(<HookProbe enabled workspaceKey="t1|" />);
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    rerender(<HookProbe enabled workspaceKey="t2|" />);
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledTimes(2);
    });
  });

  it("does not fetch when disabled", async () => {
    render(<HookProbe enabled={false} workspaceKey="t1" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockGet).not.toHaveBeenCalled();
  });
});
