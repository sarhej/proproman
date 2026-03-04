import { Link, NavLink } from "react-router-dom";
import { BarChart3, Building2, CalendarClock, Columns3, Filter, Globe, Grid2x2, Home, KanbanSquare, Megaphone, Network, Settings, Table, Users2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { User } from "../../types/models";
import type { Permissions } from "../../hooks/usePermissions";
import { Button } from "../ui/Button";

type NavSection = {
  labelKey: string;
  items: Array<{ to: string; labelKey: string; icon: typeof Home }>;
  adminOnly?: boolean;
};

const navSections: NavSection[] = [
  {
    labelKey: "nav.boards",
    items: [
      { to: "/", labelKey: "nav.domainBoard", icon: Columns3 },
      { to: "/priority", labelKey: "nav.priorityGrid", icon: Grid2x2 },
      { to: "/raci", labelKey: "nav.raciMatrix", icon: Table },
      { to: "/status-kanban", labelKey: "nav.statusKanban", icon: KanbanSquare },
      { to: "/accountability", labelKey: "nav.accountability", icon: KanbanSquare }
    ]
  },
  {
    labelKey: "nav.insights",
    items: [
      { to: "/heatmap", labelKey: "nav.heatmap", icon: Users2 },
      { to: "/buyer-user", labelKey: "nav.buyerUser", icon: BarChart3 },
      { to: "/gaps", labelKey: "nav.gaps", icon: Filter }
    ]
  },
  {
    labelKey: "nav.structure",
    items: [{ to: "/product-explorer", labelKey: "nav.productExplorer", icon: Network }]
  },
  {
    labelKey: "nav.commercial",
    items: [
      { to: "/accounts", labelKey: "nav.accounts", icon: Building2 },
      { to: "/demands", labelKey: "nav.demands", icon: Filter },
      { to: "/partners", labelKey: "nav.partners", icon: Users2 }
    ]
  },
  {
    labelKey: "nav.marketing",
    items: [
      { to: "/campaigns", labelKey: "nav.campaigns", icon: Megaphone }
    ]
  },
  {
    labelKey: "nav.planning",
    items: [
      { to: "/calendar", labelKey: "nav.calendar", icon: CalendarClock },
      { to: "/gantt", labelKey: "nav.gantt", icon: CalendarClock }
    ]
  },
  {
    labelKey: "nav.admin",
    adminOnly: true,
    items: [
      { to: "/admin", labelKey: "nav.usersActivity", icon: Settings }
    ]
  }
];

const LANGS = ["en", "cs", "sk"] as const;

type Props = {
  user: User;
  children: ReactNode;
  permissions: Permissions;
  onLogout: () => void;
  onExport: () => void;
  onExportPdf: () => void;
};

export function AppShell({ user, children, permissions, onLogout, onExport, onExportPdf }: Props) {
  const { t, i18n } = useTranslation();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header data-print-hide className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:px-6">
        <div className="flex items-center gap-3 text-sm">
          <img src="/logo.png" alt="Dr. Digital" className="h-7" />
          <span className="font-semibold text-slate-500">{t("app.brand")}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded border border-slate-200 px-1">
            <Globe size={13} className="text-slate-400" />
            {LANGS.map((lng) => (
              <button
                key={lng}
                onClick={() => i18n.changeLanguage(lng)}
                className={`px-1.5 py-0.5 text-[11px] font-medium rounded ${
                  i18n.language === lng ? "bg-sky-100 text-sky-700" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {lng.toUpperCase()}
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={onExport}>
            {t("nav.exportCsv")}
          </Button>
          <Button variant="secondary" onClick={onExportPdf}>
            {t("nav.exportPdf")}
          </Button>
          <span className="hidden text-sm text-slate-500 md:block">{user.name}</span>
          <span className="hidden rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-500 md:block">{user.role}</span>
          <Button variant="ghost" onClick={onLogout}>
            {t("nav.logout")}
          </Button>
        </div>
      </header>
      <div data-print-layout className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 p-4 md:grid-cols-[240px_1fr] md:p-6">
        <aside data-print-hide className="rounded-lg border border-slate-200 bg-white p-2">
          <div className="mb-3 flex items-center gap-2 px-2 py-1 text-xs font-semibold uppercase text-slate-500">
            <Home size={14} /> {t("nav.views")}
          </div>
          <nav className="grid gap-0.5">
            {navSections
              .filter((s) => !s.adminOnly || permissions.canManageUsers)
              .map((section) => (
                <div key={section.labelKey}>
                  <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {t(section.labelKey)}
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
                      {t(item.labelKey)}
                    </NavLink>
                  ))}
                </div>
              ))}
          </nav>
          {permissions.canCreate && (
            <Link to="/?new=1" className="mt-3 block rounded-md bg-sky-600 px-3 py-2 text-center text-sm text-white hover:bg-sky-700">
              {t("nav.newInitiative")}
            </Link>
          )}
        </aside>
        <main data-print-content>{children}</main>
      </div>
    </div>
  );
}
