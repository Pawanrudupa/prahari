import { create } from "zustand";
import { fetchDevSession, loginWithAdminToken } from "../services/api";

interface AuthState {
  sessionToken: string | null;
  isAuthenticated: boolean;
  mode: string | null;
  isDevEnv: boolean;
  isLoading: boolean;
  error: string | null;

  login: (adminToken: string) => Promise<boolean>;
  loginDevSession: () => Promise<boolean>;
  logout: () => void;
  setIsDevEnv: (value: boolean) => void;
  checkDevAvailability: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  sessionToken: null,
  isAuthenticated: false,
  mode: null,
  isDevEnv: import.meta.env.DEV, // default to true in Vite local dev
  isLoading: false,
  error: null,

  login: async (adminToken: string): Promise<boolean> => {
    set({ isLoading: true, error: null });
    try {
      const resp = await loginWithAdminToken(adminToken);
      set({
        sessionToken: resp.session_token,
        isAuthenticated: true,
        mode: resp.mode,
        isLoading: false,
        error: null,
      });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      set({ isLoading: false, error: message });
      return false;
    }
  },

  loginDevSession: async (): Promise<boolean> => {
    if (!get().isDevEnv) {
      set({ error: "Dev-session is only available in development environment" });
      return false;
    }
    set({ isLoading: true, error: null });
    try {
      const resp = await fetchDevSession();
      set({
        sessionToken: resp.session_token,
        isAuthenticated: true,
        mode: resp.mode,
        isLoading: false,
        error: null,
      });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Development session unavailable";
      set({ isLoading: false, error: message });
      return false;
    }
  },

  logout: () => {
    set({
      sessionToken: null,
      isAuthenticated: false,
      mode: null,
      error: null,
    });
  },

  setIsDevEnv: (value: boolean) => {
    set({ isDevEnv: value });
  },

  checkDevAvailability: async () => {
    try {
      const API_BASE = import.meta.env.VITE_API_URL || "/api";
      const res = await fetch(`${API_BASE}/v1/auth/dev-session`, { method: "HEAD" });
      // If endpoint returns 404, dev-session is disabled
      set({ isDevEnv: res.status !== 404 });
    } catch {
      // In case of network error, leave current isDevEnv setting
    }
  },
}));
