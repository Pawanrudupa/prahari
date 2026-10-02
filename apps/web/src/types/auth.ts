export type AuthMode = "admin" | "development-bypass";

export interface LoginResponse {
  session_token: string;
  token_type: string;
  expires_in: number;
  mode: AuthMode | string;
  warning?: string | null;
}

export interface WSTicketResponse {
  ticket: string;
  expires_in: number;
}
