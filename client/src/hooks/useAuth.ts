import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { ensureWorkspaceTenantSession } from "../lib/workspaceTenantHeader";
import type { Tenant, User } from "../types/models";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const payload = await api.getMe();
      setUser(payload.user);
      setActiveTenant(payload.activeTenant ?? null);
      ensureWorkspaceTenantSession(payload.activeTenant?.id ?? null);
      setError(null);
    } catch (e) {
      setUser(null);
      setActiveTenant(null);
      const err = e as Error & { status?: number };
      setError(err.status === 401 ? null : (err.message || "Not authenticated."));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        setLoading(true);
        const payload = await api.getMe();
        if (!cancelled) {
          setUser(payload.user);
          setActiveTenant(payload.activeTenant ?? null);
          ensureWorkspaceTenantSession(payload.activeTenant?.id ?? null);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setUser(null);
          setActiveTenant(null);
          const err = e as Error & { status?: number };
          setError(err.status === 401 ? null : (err.message || "Not authenticated."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    user,
    activeTenant,
    loading,
    error,
    isAdmin: user?.role === "ADMIN",
    refresh,
  };
}
