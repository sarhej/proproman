import { Link, NavLink } from "react-router-dom";
import { BarChart3, Building2, CalendarClock, Columns3, Filter, Grid2x2, Home, KanbanSquare, Megaphone, Network, Settings, Table, Users2 } from "lucide-react";
import type { ReactNode } from "react";
import type { User } from "../../types/models";
import type { Permissions } from "../../hooks/usePermissions";
import { Button } from "../ui/Button";

type NavSection = {
  label: string;
  items: Array<{ to: string; label: string; icon: typeof Home }>;
  adminOnly?: boolean;
};

const navSections: NavSection[] = [
  {
    label: "Boards",
    items: [
      { to: "/", label: "Domain Board", icon: Columns3 },
      { to: "/priority", label: "Priority Grid", icon: Grid2x2 },
      { to: "/raci", label: "RACI Matrix", icon: Table },
      { to: "/status-kanban", label: "Status Kanban", icon: KanbanSquare },
      { to: "/accountability", label: "Accountability", icon: KanbanSquare }
    ]
  },
  {
    label: "Insights",
    items: [
      { to: "/heatmap", label: "Heatmap", icon: Users2 },
      { to: "/buyer-user", label: "Buyer x User", icon: BarChart3 },
      { to: "/gaps", label: "Gaps", icon: Filter }
    ]
  },
  {
    label: "Structure",
    items: [{ to: "/product-explorer", label: "Product / Asset Explorer", icon: Network }]
  },
  {
    label: "Commercial",
    items: [
      { to: "/accounts", label: "Accounts", icon: Building2 },
      { to: "/demands", label: "Demands", icon: Filter },
      { to: "/partners", label: "Partners", icon: Users2 }
    ]
  },
  {
    label: "Marketing",
    items: [
      { to: "/campaigns", label: "Campaigns", icon: Megaphone }
    ]
  },
  {
    label: "Planning",
    items: [
      { to: "/calendar", label: "Calendar", icon: CalendarClock },
      { to: "/gantt", label: "Gantt", icon: CalendarClock }
    ]
  },
  {
    label: "Admin",
    adminOnly: true,
    items: [
      { to: "/admin", label: "Users & Activity", icon: Settings }
    ]
  }
];

type Props = {
  user: User;
  children: ReactNode;
  permissions: Permissions;
  onLogout: () => void;
  onExport: () => void;
  onExportPdf: () => void;
};

export function AppShell({ user, children, permissions, onLogout, onExport, onExportPdf }: Props) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header data-print-hide className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:px-6">
        <div className="flex items-center gap-3 text-sm">
          <img src="/logo.png" alt="Dr. Digital" className="h-7" />
          <span className="font-semibold text-slate-500">DrD Hub</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onExport}>
            Export CSV
          </Button>
          <Button variant="secondary" onClick={onExportPdf}>
            Export PDF
          </Button>
          <span className="hidden text-sm text-slate-500 md:block">{user.name}</span>
          <span className="hidden rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-500 md:block">{user.role}</span>
          <Button variant="ghost" onClick={onLogout}>
            Logout
          </Button>
        </div>
      </header>
      <div data-print-layout className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 p-4 md:grid-cols-[240px_1fr] md:p-6">
        <aside data-print-hide className="rounded-lg border border-slate-200 bg-white p-2">
          <div className="mb-3 flex items-center gap-2 px-2 py-1 text-xs font-semibold uppercase text-slate-500">
            <Home size={14} /> Views
          </div>
          <nav className="grid gap-0.5">
            {navSections
              .filter((s) => !s.adminOnly || permissions.canManageUsers)
              .map((section) => (
                <div key={section.label}>
                  <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {section.label}
                  </div>
                  {section.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${isActive ? "bg-sky-100 text-sky-900" : "text-slate-700 hover:bg-slate-100"}`
                      }
                    >
                      <item.icon size={14} />
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              ))}
          </nav>
          {permissions.canCreate && (
            <Link to="/?new=1" className="mt-3 block rounded-md bg-sky-600 px-3 py-2 text-center text-sm text-white hover:bg-sky-700">
              + New initiative
            </Link>
          )}
        </aside>
        <main data-print-content>{children}</main>
      </div>
    </div>
  );
}
