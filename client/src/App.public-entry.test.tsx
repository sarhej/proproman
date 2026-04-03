import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { MetaPayload, User } from "./types/models";
import App from "./App";
import i18n from "./i18n";

const mockGetMyWorkspaceRegistrationRequests = vi.fn();

vi.mock("./lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/api")>();
  return {
    api: {
      ...actual.api,
      getMyWorkspaceRegistrationRequests: (...args: unknown[]) =>
        mockGetMyWorkspaceRegistrationRequests(...args),
    },
  };
});

const mockUseAuth = vi.fn();

vi.mock("./hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

const emptyMeta: MetaPayload = {
  domains: [],
  personas: [],
  revenueStreams: [],
  users: [],
  products: [],
  accounts: [],
  partners: [],
  labelSuggestions: [],
};

const { boardStub } = vi.hoisted(() => ({
  boardStub: {
    meta: null as MetaPayload | null,
    initiatives: [] as never[],
    filters: {},
    setFilters: vi.fn(),
    setInitiatives: vi.fn(),
    refresh: vi.fn(),
    refreshSilent: vi.fn(),
    loading: false,
    error: null as string | null,
  },
}));

vi.mock("./hooks/useBoardData", () => ({
  useBoardData: () => boardStub,
}));

vi.mock("./hooks/usePermissions", () => ({
  usePermissions: () => ({
    isSuperAdmin: false,
    isAdmin: false,
    canEditStructure: false,
    canEditContent: true,
    canEditMarketing: false,
    canManageUsers: false,
    canExport: true,
    canCreate: false,
  }),
}));

vi.mock("./hooks/useUiSettings", () => ({
  useUiSettings: () => ({
    hiddenNavPaths: new Set<string>(),
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

const loggedInUser: User = {
  id: "u1",
  email: "you@example.com",
  name: "You",
  role: "EDITOR",
  isActive: true,
  activeTenantId: "t1",
};

function guestAuth() {
  return {
    user: null,
    activeTenant: null,
    loading: false,
    error: null as string | null,
    refresh: vi.fn(),
  };
}

describe("App public entry + locale policy", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.removeItem("lang");
    await i18n.changeLanguage("en");
    boardStub.meta = null;
    mockGetMyWorkspaceRegistrationRequests.mockResolvedValue({ requests: [] });
  });

  it("shows PublicLanguageSwitcher while auth is loading", () => {
    mockUseAuth.mockReturnValue({
      user: null,
      activeTenant: null,
      loading: true,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByRole("group", { name: /language/i })).toBeInTheDocument();
    expect(screen.getByText(/Loading authentication/i)).toBeInTheDocument();
  });

  it("shows PublicLanguageSwitcher on the landing page for guests", () => {
    mockUseAuth.mockReturnValue(guestAuth());

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByRole("group", { name: /language/i })).toBeInTheDocument();
    expect(screen.getByText(/Welcome to Tymio/i)).toBeInTheDocument();
  });

  it("shows PublicLanguageSwitcher on the sign-in card when ?error= is present", () => {
    mockUseAuth.mockReturnValue(guestAuth());

    render(
      <MemoryRouter initialEntries={["/?error=login_failed"]}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByRole("group", { name: /language/i })).toBeInTheDocument();
    expect(screen.getByTestId("auth-error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue with Google/i })).toBeInTheDocument();
  });

  it("keeps PublicLanguageSwitcher when navigating from landing to register", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue(guestAuth());

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText(/Welcome to Tymio/i)).toBeInTheDocument();
    await user.click(screen.getByText(/Register a new workspace/i));

    expect(screen.getByRole("group", { name: /language/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Request a workspace/i })).toBeInTheDocument();
  });

  it("clamps UI language to workspace enabledLocales when signed in", async () => {
    await i18n.changeLanguage("pl");
    localStorage.setItem("lang", "pl");

    boardStub.meta = emptyMeta;
    mockUseAuth.mockReturnValue({
      user: loggedInUser,
      activeTenant: {
        id: "t1",
        name: "Acme",
        slug: "acme",
        status: "ACTIVE",
        enabledLocales: ["en"],
        membershipRole: "OWNER",
      },
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(i18n.language.startsWith("en")).toBe(true);
    });
    expect(localStorage.getItem("lang")).toBe("en");
  });
});
