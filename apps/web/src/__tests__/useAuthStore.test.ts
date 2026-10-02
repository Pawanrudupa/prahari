import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAuthStore } from "../stores/useAuthStore";
import * as api from "../services/api";

describe("useAuthStore", () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
    vi.restoreAllMocks();
  });

  it("stores token in volatile memory only and never touches localStorage/sessionStorage", async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem");
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    vi.spyOn(api, "loginWithAdminToken").mockResolvedValueOnce({
      session_token: "prh_sess_memory_token_123",
      token_type: "Bearer",
      expires_in: 86400,
      mode: "admin",
    });

    const success = await useAuthStore.getState().login("admin-secret");
    expect(success).toBe(true);

    const state = useAuthStore.getState();
    expect(state.sessionToken).toBe("prh_sess_memory_token_123");
    expect(state.isAuthenticated).toBe(true);
    expect(state.mode).toBe("admin");

    // Invariant: no storage writes
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it("handles failed login and updates error state", async () => {
    vi.spyOn(api, "loginWithAdminToken").mockRejectedValueOnce(
      new api.ApiError(401, "Invalid administrative credentials"),
    );

    const success = await useAuthStore.getState().login("wrong-secret");
    expect(success).toBe(false);

    const state = useAuthStore.getState();
    expect(state.sessionToken).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.error).toContain("Invalid administrative credentials");
  });

  it("logs in via development bypass when in dev environment", async () => {
    useAuthStore.setState({ isDevEnv: true });

    vi.spyOn(api, "fetchDevSession").mockResolvedValueOnce({
      session_token: "prh_sess_dev_bypass_456",
      token_type: "Bearer",
      expires_in: 86400,
      mode: "development-bypass",
    });

    const success = await useAuthStore.getState().loginDevSession();
    expect(success).toBe(true);

    const state = useAuthStore.getState();
    expect(state.sessionToken).toBe("prh_sess_dev_bypass_456");
    expect(state.mode).toBe("development-bypass");
    expect(state.isAuthenticated).toBe(true);
  });

  it("refuses dev-session login when outside development", async () => {
    useAuthStore.setState({ isDevEnv: false });

    const success = await useAuthStore.getState().loginDevSession();
    expect(success).toBe(false);
    expect(useAuthStore.getState().error).toContain("only available in development");
  });

  it("logout clears in-memory credentials immediately", () => {
    useAuthStore.setState({
      sessionToken: "active-token",
      isAuthenticated: true,
      mode: "admin",
    });

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.sessionToken).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.mode).toBeNull();
  });
});
