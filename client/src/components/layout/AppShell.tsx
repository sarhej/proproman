import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Bell, Globe, Home, Menu, Plus, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { computeNavShellSections } from "../../lib/navShellModel";
import type { Tenant, User, UserMessage, UserNotificationSubscription } from "../../types/models";
import type { Permissions } from "../../hooks/usePermissions";
import { LegalFooterLinks } from "../legal/LegalFooterLinks";
import { TenantSwitcher } from "../tenant/TenantSwitcher";
import { APP_LOCALE_CODES, normalizeUiLanguageCode, type AppLocaleCode } from "../../lib/appLocales";
import { withWorkspacePrefix } from "../../lib/workspacePath";

type Props = {
  user: User;
  children: ReactNode;
  permissions: Permissions;
  /** Routes hidden for non–super-admins (from /api/ui-settings). */
  hiddenNavPaths: Set<string>;
  activeTenant?: Tenant | null;
  /** When set, shell nav links use `/t/:slug/...` hub URLs. */
  hubWorkspaceSlug?: string;
  /** Locales shown in the header picker (workspace policy + app catalog). */
  localePickerCodes?: readonly AppLocaleCode[];
  /** Show workspace-only nav items (e.g. workspace settings). */
  canManageWorkspaceStructure?: boolean;
  onTenantSwitch?: () => void;
  onNewInitiative?: () => void;
  onLogout: () => void;
  onExport: () => void;
  onExportPdf: () => void;
};

function NavContent({
  permissions,
  hiddenNavPaths,
  canManageWorkspaceStructure,
  hubWorkspaceSlug,
  onNavigate,
  mobile,
  phone,
  onExport,
  onExportPdf,
  onLogout
}: {
  permissions: Permissions;
  hiddenNavPaths: Set<string>;
  canManageWorkspaceStructure?: boolean;
  hubWorkspaceSlug?: string;
  onNavigate?: () => void;
  mobile?: boolean;
  phone?: boolean;
  onExport?: () => void;
  onExportPdf?: () => void;
  onLogout?: () => void;
}) {
  const { t } = useTranslation();
  const navBlocks = computeNavShellSections({
    permissions,
    canManageWorkspaceStructure,
    hiddenNavPaths,
    mobile,
    phone
  });

  const navTo = (logical: string) =>
    hubWorkspaceSlug ? withWorkspacePrefix(hubWorkspaceSlug, logical) : logical;

  return (
    <>
      {!phone && (
        <div className="mb-3 flex items-center gap-2 px-2 py-1 text-xs font-semibold uppercase text-slate-500">
          <Home size={14} /> {t("nav.views")}
        </div>
      )}
      <nav className="grid gap-0.5">
        {navBlocks.map(({ section, items }) => {
          return (
            <div key={section.labelKey}>
              <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {t(section.labelKey)}
              </div>
              {items.map((item) =>
                item.fullPage ? (
                  <a
                    key={`${item.labelKey}-${item.to}`}
                    href={item.to}
                    onClick={onNavigate}
                    className="flex items-center gap-2 rounded-md px-3 py-2.5 lg:py-1.5 text-sm text-slate-700 hover:bg-slate-100"
                  >
                    <item.icon size={14} />
                    {t(item.labelKey)}
                  </a>
                ) : (
                  <NavLink
                    key={item.to}
                    to={navTo(item.to)}
                    end
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-md px-3 py-2.5 lg:py-1.5 text-sm ${isActive ? "bg-sky-100 text-sky-900" : "text-slate-700 hover:bg-slate-100"}`
                    }
                  >
                    <item.icon size={14} />
                    {t(item.labelKey)}
                  </NavLink>
                )
              )}
            </div>
          );
        })}
      </nav>
      {permissions.canCreate && (
        <Link
          to={`${navTo("/")}?new=1`}
          onClick={onNavigate}
          className="mt-3 flex items-center justify-center gap-1.5 rounded-md bg-sky-600 px-3 py-2 text-center text-sm text-white hover:bg-sky-700"
        >
          <Plus size={14} />
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

export function AppShell({
  user,
  children,
  permissions,
  hiddenNavPaths,
  activeTenant,
  hubWorkspaceSlug,
  localePickerCodes,
  canManageWorkspaceStructure,
  onTenantSwitch,
  onNewInitiative,
  onLogout,
  onExport,
  onExportPdf,
}: Props) {
  const { t, i18n } = useTranslation();
  const pickerCodes =
    localePickerCodes && localePickerCodes.length > 0 ? localePickerCodes : [...APP_LOCALE_CODES];
  const currentLng = normalizeUiLanguageCode(i18n.language);
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
        const raw = msg.linkUrl;
        const prefixed =
          hubWorkspaceSlug &&
          !raw.startsWith("/t/") &&
          !raw.startsWith("/wiki") &&
          !raw.startsWith("/register-workspace") &&
          !raw.startsWith("/platform")
            ? withWorkspacePrefix(hubWorkspaceSlug, raw)
            : raw;
        navigate(prefixed);
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
            {activeTenant && (
              <div className="mb-3 border-b border-slate-200 pb-3">
                <TenantSwitcher
                  activeTenant={activeTenant}
                  currentUser={{ name: user.name, email: user.email }}
                  onSwitch={() => {
                    closeDrawer();
                    onTenantSwitch?.();
                    window.location.reload();
                  }}
                  compact
                />
              </div>
            )}
            <NavContent
              permissions={permissions}
              hiddenNavPaths={hiddenNavPaths}
              canManageWorkspaceStructure={canManageWorkspaceStructure}
              hubWorkspaceSlug={hubWorkspaceSlug}
              onNavigate={closeDrawer}
              mobile
              phone={phone}
              onLogout={onLogout}
            />
            <LegalFooterLinks className="mt-3 border-t border-slate-100 px-3 pt-3 text-[11px] leading-snug text-slate-400" />
            <div className="mt-4 border-t border-slate-200 pt-3 flex flex-wrap items-center gap-1 px-3">
              <Globe size={13} className="text-slate-400 shrink-0" />
              {pickerCodes.map((lng) => (
                <button
                  key={lng}
                  type="button"
                  onClick={() => {
                    void i18n.changeLanguage(lng);
                    try {
                      localStorage.setItem("lang", lng);
                    } catch {
                      /* ignore */
                    }
                  }}
                  className={`px-2 py-1 text-xs font-medium rounded ${
                    currentLng === lng ? "bg-sky-100 text-sky-700" : "text-slate-500 hover:text-slate-700"
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
          <img src="/tymio-icon.svg" alt="Tymio" className="h-7 w-7 rounded lg:hidden" />
          <img src="/logo.svg" alt="Tymio" className="hidden lg:block h-7" />
          <span className="hidden lg:inline font-semibold text-slate-500">{t("app.brand")}</span>
          {activeTenant && (
            <div className="hidden lg:block">
              <TenantSwitcher
                activeTenant={activeTenant}
                currentUser={{ name: user.name, email: user.email }}
                onSwitch={() => {
                  onTenantSwitch?.();
                  window.location.reload();
                }}
              />
            </div>
          )}
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
          <div className="hidden lg:flex max-w-[min(100%,14rem)] flex-wrap items-center justify-end gap-0.5 rounded border border-slate-200 px-1 py-0.5">
            <Globe size={13} className="text-slate-400 shrink-0" />
            {pickerCodes.map((lng) => (
              <button
                key={lng}
                type="button"
                title={t(`lang.${lng}`)}
                onClick={() => {
                  void i18n.changeLanguage(lng);
                  try {
                    localStorage.setItem("lang", lng);
                  } catch {
                    /* ignore */
                  }
                }}
                className={`px-1.5 py-0.5 text-[11px] font-medium rounded ${
                  currentLng === lng ? "bg-sky-100 text-sky-700" : "text-slate-500 hover:text-slate-700"
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
          <NavContent
            permissions={permissions}
            hiddenNavPaths={hiddenNavPaths}
            canManageWorkspaceStructure={canManageWorkspaceStructure}
            hubWorkspaceSlug={hubWorkspaceSlug}
            onExport={onExport}
            onExportPdf={onExportPdf}
            onLogout={onLogout}
          />
          <LegalFooterLinks className="mt-4 border-t border-slate-100 px-2 pb-2 pt-3 text-[11px] leading-snug text-slate-400" />
        </aside>
        <main data-print-content>{children}</main>
      </div>
    </div>
  );
}
