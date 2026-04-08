import { navSections, type NavItem, type NavSection } from "./navSections";
import type { Permissions } from "../hooks/usePermissions";

export type NavShellPermissions = Pick<Permissions, "canManageUsers" | "isSuperAdmin">;

/**
 * Pure nav visibility (matches AppShell NavContent). Used for tests and a single implementation source.
 */
export function computeNavShellSections(input: {
  permissions: NavShellPermissions;
  canManageWorkspaceStructure?: boolean;
  hiddenNavPaths: Set<string>;
  mobile?: boolean;
  phone?: boolean;
}): { section: NavSection; items: NavItem[] }[] {
  const {
    permissions,
    canManageWorkspaceStructure = false,
    hiddenNavPaths,
    mobile,
    phone
  } = input;
  const hideShellRoutes = !permissions.isSuperAdmin && hiddenNavPaths.size > 0;

  const sections = navSections
    .filter(
      (s) =>
        !s.adminOnly ||
        permissions.canManageUsers ||
        Boolean(canManageWorkspaceStructure)
    )
    .filter((s) => !mobile || !s.mobileHidden)
    .filter((s) => !phone || !s.phoneHidden);

  const out: { section: NavSection; items: NavItem[] }[] = [];
  for (const section of sections) {
    let items = mobile ? section.items.filter((i) => !i.mobileHidden) : section.items;
    if (phone) items = items.filter((i) => !i.phoneHidden);
    items = items.filter((i) => !i.superAdminOnly || permissions.isSuperAdmin);
    items = items.filter((i) => !i.workspaceStructureOnly || canManageWorkspaceStructure);
    items = items.filter((i) => !i.userManagementOnly || permissions.canManageUsers);
    // Platform operators manage workspace shell settings from /platform (Workspaces), not the hub menu.
    items = items.filter(
      (i) => !(permissions.isSuperAdmin && i.to === "/workspace-settings")
    );
    if (hideShellRoutes) {
      items = items.filter(
        (i) =>
          !hiddenNavPaths.has(i.to) ||
          (Boolean(i.workspaceStructureOnly) && Boolean(canManageWorkspaceStructure))
      );
    }
    if (items.length === 0) continue;
    out.push({ section, items });
  }
  return out;
}
