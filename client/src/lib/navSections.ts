import {
  BarChart3,
  Building2,
  CalendarClock,
  Columns3,
  Filter,
  Grid2x2,
  KanbanSquare,
  Megaphone,
  Network,
  Settings,
  Shield,
  Table,
  Users2,
  Bot
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  mobileHidden?: boolean;
  phoneHidden?: boolean;
  /** Full page load (separate SPA), e.g. /platform/ tenant console */
  fullPage?: boolean;
  /** Only show for SUPER_ADMIN */
  superAdminOnly?: boolean;
};

export type NavSection = {
  labelKey: string;
  items: NavItem[];
  adminOnly?: boolean;
  mobileHidden?: boolean;
  phoneHidden?: boolean;
};

export const navSections: NavSection[] = [
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
    phoneHidden: true,
    items: [
      { to: "/kpi-dashboard", labelKey: "nav.kpiDashboard", icon: BarChart3 },
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
    mobileHidden: true,
    items: [
      { to: "/accounts", labelKey: "nav.accounts", icon: Building2 },
      { to: "/demands", labelKey: "nav.demands", icon: Filter },
      { to: "/partners", labelKey: "nav.partners", icon: Users2 }
    ]
  },
  {
    labelKey: "nav.marketing",
    items: [{ to: "/campaigns", labelKey: "nav.campaigns", icon: Megaphone }]
  },
  {
    labelKey: "nav.planning",
    items: [
      { to: "/milestones", labelKey: "nav.milestonesTimeline", icon: CalendarClock },
      { to: "/calendar", labelKey: "nav.calendar", icon: CalendarClock },
      { to: "/gantt", labelKey: "nav.gantt", icon: CalendarClock, mobileHidden: true }
    ]
  },
  {
    labelKey: "nav.admin",
    adminOnly: true,
    items: [
      { to: "/admin", labelKey: "nav.usersActivity", icon: Settings },
      { to: "/agent-setup", labelKey: "nav.agentSetup", icon: Bot },
      {
        to: "/platform/",
        labelKey: "nav.platformConsole",
        icon: Shield,
        fullPage: true,
        superAdminOnly: true
      }
    ]
  }
];
