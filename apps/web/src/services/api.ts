import type { LoginResponse, WSTicketResponse } from "../types/auth";
import type { GraphSnapshot } from "../types/graph";
import { useAuthStore } from "../stores/useAuthStore";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(`API Error ${status}: ${detail}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // Non-negotiable invariant: any 401 automatically clears session and redirects to login
    useAuthStore.getState().logout();
    throw new ApiError(401, "Session expired or invalid credentials");
  }

  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || errorDetail;
    } catch {
      // Ignore json parse error on non-json body
    }
    throw new ApiError(response.status, errorDetail);
  }

  return response.json() as Promise<T>;
}

export async function loginWithAdminToken(adminToken: string): Promise<LoginResponse> {
  return request<LoginResponse>("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ admin_token: adminToken.trim() }),
  });
}

export async function fetchDevSession(): Promise<LoginResponse> {
  return request<LoginResponse>("/v1/auth/dev-session", {
    method: "GET",
  });
}

export async function fetchWsTicket(sessionToken: string): Promise<WSTicketResponse> {
  return request<WSTicketResponse>("/v1/auth/ws-ticket", {
    method: "POST",
  }, sessionToken);
}

export async function fetchGraphSnapshot(sessionToken: string): Promise<GraphSnapshot> {
  return request<GraphSnapshot>("/v1/graph/snapshot", {
    method: "GET",
  }, sessionToken);
}

export async function checkBackendHealth(): Promise<{ status: string; env?: string }> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) return { status: "unhealthy" };
    return res.json();
  } catch {
    return { status: "unreachable" };
  }
}
