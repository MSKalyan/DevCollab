import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";
import { useToast } from "../components/ui/Toast";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const toast = useToast();
  const userRef = useRef(user);
  const expiryHandledRef = useRef(false);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const handleSessionExpired = useCallback(() => {
    // Only act if we had a live session — a first visit (no cookies) hits
    // /auth/me, gets a 401, and tries to refresh too; that is not an expiry.
    if (!userRef.current || expiryHandledRef.current) return;
    expiryHandledRef.current = true;
    setUser(null);
    toast.error("Your session expired. Please log in again.");
    navigate("/login");
  }, [navigate, toast]);

  useEffect(() => {
    window.addEventListener("auth:session-expired", handleSessionExpired);
    return () => window.removeEventListener("auth:session-expired", handleSessionExpired);
  }, [handleSessionExpired]);

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

  const login = useCallback(async (fn) => {
    await fn();
    await refresh();
    expiryHandledRef.current = false;
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* ignore */
    }
    setUser(null);
  }, []);

  const value = {
    user,
    isLoggedIn: !!user,
    role: user?.role || null,
    loading,
    refresh,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
