import { useEffect, useState, useCallback } from "react";
import api from "../api/api";

export default function useAuth() {
  const [user, setUser] = useState(null); // { ...profile, role }
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get("/auth/me");
      setUser(res.data);
      return res.data;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* ignore */
    }
    setUser(null);
  }, []);

  return {
    user,
    isLoggedIn: !!user,
    role: user?.role || null,
    loading,
    refresh,
    logout,
  };
}
