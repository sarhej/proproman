import { describe, it, expect } from "vitest";
import { computeNavShellSections } from "./navShellModel";
import { navSections } from "./navSections";

function pathsInSection(blocks: ReturnType<typeof computeNavShellSections>, sectionLabelKey: string): string[] {
  const b = blocks.find((x) => x.section.labelKey === sectionLabelKey);
  return b ? b.items.map((i) => i.to) : [];
}

describe("computeNavShellSections", () => {
  it("structure section lists only product explorer (workspace settings moved to admin)", () => {
    const blocks = computeNavShellSections({
      permissions: { canManageUsers: true, isSuperAdmin: true },
      canManageWorkspaceStructure: true,
      hiddenNavPaths: new Set(),
    });
    expect(pathsInSection(blocks, "nav.structure")).toEqual(["/product-explorer"]);
  });

  it("global admin sees Users, Settings, workspace settings, agent setup in admin block", () => {
    const blocks = computeNavShellSections({
      permissions: { canManageUsers: true, isSuperAdmin: false },
      canManageWorkspaceStructure: true,
      hiddenNavPaths: new Set(),
    });
    expect(pathsInSection(blocks, "nav.admin")).toEqual([
      "/admin/users",
      "/admin/settings",
      "/workspace-settings",
      "/agent-setup",
    ]);
  });

  it("super admin sees hub admin links and platform console but not workspace settings in shell", () => {
    const blocks = computeNavShellSections({
      permissions: { canManageUsers: true, isSuperAdmin: true },
      canManageWorkspaceStructure: true,
      hiddenNavPaths: new Set(),
    });
    expect(pathsInSection(blocks, "nav.admin")).toEqual([
      "/admin/users",
      "/admin/settings",
      "/agent-setup",
      "/platform/",
    ]);
  });

  it("workspace owner without global admin sees only workspace settings under admin", () => {
    const blocks = computeNavShellSections({
      permissions: { canManageUsers: false, isSuperAdmin: false },
      canManageWorkspaceStructure: true,
      hiddenNavPaths: new Set(),
    });
    expect(pathsInSection(blocks, "nav.admin")).toEqual(["/workspace-settings"]);
  });

  it("hides entire admin section when neither global admin nor workspace structure manager", () => {
    const blocks = computeNavShellSections({
      permissions: { canManageUsers: false, isSuperAdmin: false },
      canManageWorkspaceStructure: false,
      hiddenNavPaths: new Set(),
    });
    expect(blocks.some((b) => b.section.labelKey === "nav.admin")).toBe(false);
  });

  it("when routes are hidden, workspace settings stays visible for structure managers", () => {
    const blocks = computeNavShellSections({
      permissions: { canManageUsers: false, isSuperAdmin: false },
      canManageWorkspaceStructure: true,
      hiddenNavPaths: new Set(["/workspace-settings", "/priority"]),
    });
    expect(pathsInSection(blocks, "nav.admin")).toEqual(["/workspace-settings"]);
    expect(pathsInSection(blocks, "nav.boards")).not.toContain("/priority");
  });

  it("super admin does not get workspace-settings in shell even if it appears in hidden list", () => {
    const blocks = computeNavShellSections({
      permissions: { canManageUsers: true, isSuperAdmin: true },
      canManageWorkspaceStructure: true,
      hiddenNavPaths: new Set(["/workspace-settings"]),
    });
    expect(pathsInSection(blocks, "nav.admin")).not.toContain("/workspace-settings");
  });
});

describe("navSections data (admin / structure split)", () => {
  it("admin section defines split routes and flags", () => {
    const admin = navSections.find((s) => s.adminOnly);
    expect(admin).toBeDefined();
    const items = admin!.items;
    const users = items.find((i) => i.to === "/admin/users");
    const settings = items.find((i) => i.to === "/admin/settings");
    const ws = items.find((i) => i.to === "/workspace-settings");
    expect(users?.userManagementOnly).toBe(true);
    expect(settings?.userManagementOnly).toBe(true);
    expect(ws?.workspaceStructureOnly).toBe(true);
    expect(ws?.userManagementOnly).toBeUndefined();
  });

  it("structure section has no workspace-settings entry", () => {
    const structure = navSections.find((s) => s.labelKey === "nav.structure");
    expect(structure?.items.some((i) => i.to === "/workspace-settings")).toBe(false);
  });
});
