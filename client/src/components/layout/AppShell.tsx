import { Link, NavLink } from "react-router-dom";
import { BarChart3, Building2, Columns3, Filter, Grid2x2, Home, User2, Users2 } from "lucide-react";
import type { ReactNode } from "react";
import type { User } from "../../types/models";
import { Button } from "../ui/Button";

const nav = [
  { to: "/", label: "Domain Board", icon: Columns3 },
  { to: "/priority", label: "Priority Grid", icon: Grid2x2 },
  { to: "/owner", label: "Owner Board", icon: User2 },
  { to: "/heatmap", label: "Heatmap", icon: Users2 },
  { to: "/buyer-user", label: "Buyer x User", icon: BarChart3 },
  { to: "/gaps", label: "Gaps", icon: Filter }
];

type Props = {
  user: User;
  children: ReactNode;
  onLogout: () => void;
  onExport: () => void;
  onExportPdf: () => void;
};

export function AppShell({ user, children, onLogout, onExport, onExportPdf }: Props) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:px-6">
        <div className="flex items-center gap-2 text-sm">
          <Building2 size={18} />
          <span className="font-semibold">DD Product Board</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onExport}>
            Export CSV
          </Button>
          <Button variant="secondary" onClick={onExportPdf}>
            Export PDF
          </Button>
          <Button variant="secondary" onClick={() => navigator.clipboard.writeText(window.location.href)}>
            Share link
          </Button>
          <span className="hidden text-sm text-slate-500 md:block">{user.name}</span>
          <Button variant="ghost" onClick={onLogout}>
            Logout
          </Button>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 p-4 md:grid-cols-[240px_1fr] md:p-6">
        <aside className="rounded-lg border border-slate-200 bg-white p-2">
          <div className="mb-3 flex items-center gap-2 px-2 py-1 text-xs font-semibold uppercase text-slate-500">
            <Home size={14} /> Views
          </div>
          <nav className="grid gap-1">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 text-sm ${isActive ? "bg-sky-100 text-sky-900" : "text-slate-700 hover:bg-slate-100"}`
                }
              >
                <item.icon size={16} />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <Link to="/?new=1" className="mt-3 block rounded-md bg-sky-600 px-3 py-2 text-center text-sm text-white hover:bg-sky-700">
            + New initiative
          </Link>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
