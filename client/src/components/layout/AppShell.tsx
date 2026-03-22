import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { BarChart3, Bell, Building2, CalendarClock, Columns3, Filter, Globe, Grid2x2, Home, KanbanSquare, Menu, Megaphone, Network, Plus, Settings, Table, Users2, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import type { User, UserMessage, UserNotificationSubscription } from "../../types/models";
import type { Permissions } from "../../hooks/usePermissions";


type NavItem = { to: string; labelKey: string; icon: typeof Home; mobileHidden?: boolean; phoneHidden?: boolean };

type NavSection = {
  labelKey: string;
  items: NavItem[];
  adminOnly?: boolean;
  mobileHidden?: boolean;
  phoneHidden?: boolean;
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
    items: [
      { to: "/product-explorer", labelKey: "nav.productExplorer", icon: Network },
      { to: "/requirements/kanban", labelKey: "nav.requirementsKanban", icon: KanbanSquare }
    ]
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
    items: [
      { to: "/campaigns", labelKey: "nav.campaigns", icon: Megaphone }
    ]
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
      { to: "/admin", labelKey: "nav.usersActivity", icon: Settings }
    ]
  }
];

const LANGS = ["en", "cs", "sk", "uk"] as const;

type Props = {
  user: User;
  children: ReactNode;
  permissions: Permissions;
  onNewInitiative?: () => void;
  onLogout: () => void;
  onExport: () => void;
  onExportPdf: () => void;
};

function NavContent({ permissions, onNavigate, mobile, phone, onExport, onExportPdf, onLogout }: {
  permissions: Permissions;
  onNavigate?: () => void;
  mobile?: boolean;
  phone?: boolean;
  onExport?: () => void;
  onExportPdf?: () => void;
  onLogout?: () => void;
}) {
  const { t } = useTranslation();
  const sections = navSections
    .filter((s) => !s.adminOnly || permissions.canManageUsers)
    .filter((s) => !mobile || !s.mobileHidden)
    .filter((s) => !phone || !s.phoneHidden);

  return (
    <>
      {!phone && (
        <div className="mb-3 flex items-center gap-2 px-2 py-1 text-xs font-semibold uppercase text-slate-500">
          <Home size={14} /> {t("nav.views")}
        </div>
      )}
      <nav className="grid gap-0.5">
        {sections.map((section) => {
          let items = mobile ? section.items.filter((i) => !i.mobileHidden) : section.items;
          if (phone) items = items.filter((i) => !i.phoneHidden);
          if (items.length === 0) return null;
          return (
            <div key={section.labelKey}>
              <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {t(section.labelKey)}
              </div>
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-md px-3 py-2.5 lg:py-1.5 text-sm ${isActive ? "bg-sky-100 text-sky-900" : "text-slate-700 hover:bg-slate-100"}`
                  }
                >
                  <item.icon size={14} />
                  {t(item.labelKey)}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      {permissions.canCreate && (
        <Link
          to="/?new=1"
          onClick={onNavigate}
          className="mt-3 block rounded-md bg-sky-600 px-3 py-2 text-center text-sm text-white hover:bg-sky-700"
        >
          {t("nav.newInitiative")}
        </Link>
      )}
      {(onExport || onExportPdf || onLogout) && (
        <div className="mt-4 border-t border-slate-200 pt-3 grid gap-1">
          {onExport && (
            <button onClick={() => { onNavigate?.(); onExport(); }} className="flex items-center gap-2 rounded-md px-3 py-2.5 lg:py-1.5 text-sm text-slate-700 hover:bg-slate-100">
              {t("nav.exportCsv")}
            </button>
          )}
          {onExportPdf && (
            <button onClick={() => { onNavigate?.(); onExportPdf(); }} className="flex items-center gap-2 rounded-md px-3 py-2.5 lg:py-1.5 text-sm text-slate-700 hover:bg-slate-100">
              {t("nav.exportPdf")}
            </button>
          )}
          {onLogout && (
            <button onClick={() => { onNavigate?.(); onLogout(); }} className="flex items-center gap-2 rounded-md px-3 py-2.5 lg:py-1.5 text-sm text-red-600 hover:bg-red-50">
              {t("nav.logout")}
            </button>
          )}
        </div>
      )}
    </>
  );
}

const isPhone = () => window.matchMedia("(max-width: 639px)").matches;

function SubscriptionsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [subscriptions, setSubscriptions] = useState<UserNotificationSubscription[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { subscriptions: s } = await api.getNotificationSubscriptions();
      setSubscriptions(s);
    } catch {
      setSubscriptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unsubscribe = useCallback(async (id: string) => {
    try {
      await api.deleteNotificationSubscription(id);
      setSubscriptions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-800">{t("notificationSubscriptions.title")}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-4 flex-1">
          {loading ? (
            <p className="text-sm text-slate-500">{t("admin.loadingRules")}</p>
          ) : subscriptions.length === 0 ? (
            <p className="text-sm text-slate-500">{t("notificationSubscriptions.empty")}</p>
          ) : (
            <ul className="space-y-2">
              {subscriptions.map((sub) => (
                <li
                  key={sub.id}
                  className="flex items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50/50 px-3 py-2 text-sm"
                >
                  <span className="text-slate-700">
                    {sub.entityType} · {sub.action} · {t(`notificationSubscriptions.scope.${sub.scopeType}`)}
                    {sub.scopeId ? ` (${sub.scopeId.slice(0, 8)}…)` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => unsubscribe(sub.id)}
                    className="shrink-0 text-xs text-red-600 hover:text-red-800 font-medium"
                  >
                    {t("notificationSubscriptions.unsubscribe")}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-xs font-semibold uppercase text-slate-400 mb-2">{t("admin.ruleChannels")}</p>
            <p className="text-sm text-slate-500">
              {t("admin.channel.IN_APP")}: {t("common.active")}. {t("admin.channel.EMAIL")} / {t("admin.channel.SLACK")} / {t("admin.channel.WHATSAPP")}: Coming soon.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ user, children, permissions, onNewInitiative, onLogout, onExport, onExportPdf }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [phone, setPhone] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [messages, setMessages] = useState<UserMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [subscriptionsModalOpen, setSubscriptionsModalOpen] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const loadMessages = useCallback(async () => {
    try {
      const res = await api.getMessages();
      setMessages(res.messages);
      setUnreadCount(res.unreadCount);
    } catch {
      setMessages([]);
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => { closeDrawer(); }, [location.pathname, closeDrawer]);

  useEffect(() => {
    void loadMessages();
    const interval = setInterval(loadMessages, 60 * 1000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  useEffect(() => {
    if (!messagesOpen) return;
    const close = (e: MouseEvent) => {
      if (messagesRef.current && !messagesRef.current.contains(e.target as Node)) setMessagesOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [messagesOpen]);

  async function handleMessageClick(msg: UserMessage) {
    if (!msg.readAt) {
      await api.markMessageRead(msg.id);
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, readAt: new Date().toISOString() } : m)));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    if (msg.linkUrl) {
      if (msg.linkUrl.startsWith("/")) {
        navigate(msg.linkUrl);
      } else {
        window.open(msg.linkUrl, "_blank");
      }
    }
    setMessagesOpen(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={closeDrawer}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute inset-y-0 right-0 w-[280px] overflow-y-auto bg-white p-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                    {user.name.charAt(0)}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold">{user.name}</p>
                  <p className="text-[10px] text-slate-400">{user.role}</p>
                </div>
              </div>
              <button onClick={closeDrawer} className="rounded p-1 hover:bg-slate-100">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <NavContent permissions={permissions} onNavigate={closeDrawer} mobile phone={phone} onLogout={onLogout} />
            <div className="mt-4 border-t border-slate-200 pt-3 flex items-center gap-1 px-3">
              <Globe size={13} className="text-slate-400" />
              {LANGS.map((lng) => (
                <button
                  key={lng}
                  onClick={() => i18n.changeLanguage(lng)}
                  className={`px-2 py-1 text-xs font-medium rounded ${
                    i18n.language === lng ? "bg-sky-100 text-sky-700" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {lng.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <header data-print-hide className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:px-6">
        <div className="flex items-center gap-3 text-sm">
          <img src="/favicon-192.png" alt="DrD" className="h-7 w-7 rounded lg:hidden" />
          <img src="/logo.png" alt="Dr. Digital" className="hidden lg:block h-7" />
          <span className="hidden lg:inline font-semibold text-slate-500">{t("app.brand")}</span>
        </div>
        <div className="flex items-center gap-2">
          {onNewInitiative ? (
            <button
              type="button"
              onClick={onNewInitiative}
              className="hidden lg:flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
            >
              <Plus size={14} />
              {t("nav.newInitiative")}
            </button>
          ) : null}
          <div className="relative" ref={messagesRef}>
            <button
              type="button"
              onClick={() => { setMessagesOpen((o) => !o); if (!messagesOpen) void loadMessages(); }}
              className="relative rounded p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              title={t("nav.messages")}
            >
              <Bell size={18} />
              {unreadCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </button>
            {messagesOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                <div className="px-3 py-2 text-xs font-semibold uppercase text-slate-400">{t("nav.messages")}</div>
                {messages.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-slate-400">{t("nav.messagesEmpty")}</p>
                ) : (
                  <ul className="space-y-0.5">
                    {messages.map((msg) => {
                      const displayTitle = msg.titleKey
                        ? t(msg.titleKey, (msg.titleParams as Record<string, string>) ?? {})
                        : msg.title ?? "";
                      const displayBody = msg.bodyKey
                        ? t(msg.bodyKey, (msg.bodyParams as Record<string, string>) ?? {})
                        : msg.body ?? null;
                      const displayLinkLabel = msg.linkLabelKey
                        ? t(msg.linkLabelKey, (msg.linkLabelParams as Record<string, string>) ?? {})
                        : msg.linkLabel ?? null;
                      return (
                        <li key={msg.id}>
                          <button
                            type="button"
                            onClick={() => handleMessageClick(msg)}
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${!msg.readAt ? "bg-sky-50/50" : ""}`}
                          >
                            <div className="font-medium text-slate-900">{displayTitle}</div>
                            {displayBody ? <div className="mt-0.5 line-clamp-1 text-xs text-slate-500">{displayBody}</div> : null}
                            <div className="mt-1 text-[10px] text-slate-400">
                              {new Date(msg.createdAt).toLocaleString()}
                              {msg.linkUrl && displayLinkLabel ? ` \u00b7 ${displayLinkLabel}` : ""}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="border-t border-slate-100 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => { setSubscriptionsModalOpen(true); setMessagesOpen(false); }}
                    className="text-xs text-sky-600 hover:text-sky-800 font-medium"
                  >
                    {t("notificationSubscriptions.title")}
                  </button>
                </div>
              </div>
            )}
          </div>
          {subscriptionsModalOpen && (
            <SubscriptionsModal
              onClose={() => setSubscriptionsModalOpen(false)}
            />
          )}
          <div className="hidden lg:flex items-center gap-1 rounded border border-slate-200 px-1">
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
          <span className="hidden text-sm text-slate-500 lg:block">{user.name}</span>
          <span className="hidden rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-500 lg:block">{user.role}</span>
          <button className="lg:hidden rounded p-1 hover:bg-slate-100" onClick={() => { setPhone(isPhone()); setDrawerOpen(true); }}>
            <Menu size={20} className="text-slate-600" />
          </button>
        </div>
      </header>

      <div data-print-layout className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 p-4 lg:grid-cols-[240px_1fr] lg:p-6">
        <aside data-print-hide className="hidden lg:block rounded-lg border border-slate-200 bg-white p-2">
          <NavContent permissions={permissions} onExport={onExport} onExportPdf={onExportPdf} onLogout={onLogout} />
        </aside>
        <main data-print-content>{children}</main>
      </div>
    </div>
  );
}
