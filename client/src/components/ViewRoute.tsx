import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import type { User } from "../types/models";
import { firstAvailableNavPath } from "../lib/navViewPaths";

type Props = {
  user: User;
  path: string;
  hiddenNavPaths: Set<string>;
  /** When true, this route stays reachable even if listed in ui-settings (e.g. workspace settings for OWNER/ADMIN). */
  ignoreHide?: boolean;
  children: ReactNode;
};

/** Blocks the route for non–super-admins when this path is hidden in ui-settings. */
export function ViewRoute({ user, path, hiddenNavPaths, ignoreHide, children }: Props) {
  const { t } = useTranslation();
  if (user.role === "SUPER_ADMIN" || ignoreHide || !hiddenNavPaths.has(path)) {
    return <>{children}</>;
  }
  const next = firstAvailableNavPath(hiddenNavPaths);
  if (next) {
    return <Navigate to={next} replace />;
  }
  return (
    <div className="rounded border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
      {t("app.noNavViewsAvailable")}
    </div>
  );
}
