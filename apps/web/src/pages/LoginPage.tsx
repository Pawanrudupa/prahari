import { useState, type FormEvent } from "react";
import { useAuthStore } from "../stores/useAuthStore";

export function LoginPage() {
  const [tokenInput, setTokenInput] = useState("");
  const login = useAuthStore((s) => s.login);
  const loginDevSession = useAuthStore((s) => s.loginDevSession);
  const isDevEnv = useAuthStore((s) => s.isDevEnv);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    await login(tokenInput);
  };

  const handleDevSession = async () => {
    await loginDevSession();
  };

  return (
    <div className="min-h-screen w-full bg-[#070A12] text-[#F8FAFC] flex flex-col justify-center items-center px-4">
      {/* Background radial gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(45,212,167,0.06),transparent_60%)] pointer-events-none" />

      <div className="w-full max-w-md bg-[#0D121F] border border-white/10 rounded-xl p-8 shadow-2xl relative z-10 backdrop-blur-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-[#2DD4A7]/10 border border-[#2DD4A7]/30 text-[#2DD4A7] font-bold text-xl mb-3">
            P
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            Prahari <span className="text-xs font-normal text-white/40 tracking-wider">v0.1.0</span>
          </h1>
          <p className="text-sm text-white/50 mt-1 font-mono">Agent Governance Console</p>
        </div>

        {/* Error message */}
        {error && (
          <div
            data-testid="login-error"
            className="mb-6 p-3 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs font-mono"
          >
            {error}
          </div>
        )}

        {/* Admin Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="admin-token"
              className="block text-xs font-mono text-white/70 mb-1.5 uppercase tracking-wider"
            >
              Operator Admin Token
            </label>
            <input
              id="admin-token"
              data-testid="admin-token-input"
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Enter ADMIN_TOKEN..."
              disabled={isLoading}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#070A12] border border-white/15 text-white placeholder-white/20 text-sm font-mono focus:outline-none focus:border-[#2DD4A7] focus:ring-1 focus:ring-[#2DD4A7] transition"
            />
          </div>

          <button
            type="submit"
            data-testid="submit-login"
            disabled={isLoading || !tokenInput.trim()}
            className="w-full py-2.5 px-4 rounded-lg bg-[#2DD4A7] hover:bg-[#26b890] disabled:bg-white/10 disabled:text-white/30 text-black font-semibold text-sm transition cursor-pointer disabled:cursor-not-allowed"
          >
            {isLoading ? "Authenticating..." : "Sign In to Console"}
          </button>
        </form>

        {/* Dev Session Bypass */}
        {isDevEnv && (
          <div className="mt-6 pt-6 border-t border-white/10">
            <div className="text-center mb-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400/80 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded">
                Development Environment Only
              </span>
            </div>
            <button
              type="button"
              data-testid="dev-session-button"
              onClick={handleDevSession}
              disabled={isLoading}
              className="w-full py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-white/80 hover:text-white text-xs font-mono transition cursor-pointer"
            >
              ⚡ Fast Launch via Dev-Session Bypass
            </button>
          </div>
        )}

        {/* Security Invariant Note */}
        <div className="mt-6 pt-4 border-t border-white/5 text-center">
          <p className="text-[11px] text-white/30 leading-relaxed font-mono">
            🛡️ Zero-Disk Invariant: Credentials and session tokens are strictly kept in volatile memory and never stored in localStorage.
          </p>
        </div>
      </div>
    </div>
  );
}
