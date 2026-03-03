import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { User } from "../types/models";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        setLoading(true);
        const payload = await api.getMe();
        if (!cancelled) {
          setUser(payload.user);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setError("Not authenticated.");
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
    loading,
    error,
    isAdmin: user?.role === "ADMIN"
  };
}
