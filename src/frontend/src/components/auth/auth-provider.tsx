"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { authApi } from "@/lib/api";
import { tokenStore } from "@/lib/auth/session";
import type { User } from "@/types/api";

type AuthState = {
  user: User | null;
  loading: boolean;
  isLoggedIn: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = tokenStore.getAccessToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await authApi.me(token);
      setUser(me);
    } catch {
      tokenStore.clearSession();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    const token = tokenStore.getAccessToken();
    try {
      if (token) await authApi.signOut(token);
    } catch {
      // ignore
    }
    tokenStore.clearSession();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isLoggedIn: Boolean(user),
      refresh,
      signOut,
    }),
    [user, loading, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
