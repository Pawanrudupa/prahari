import { useState, type FormEvent } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import {
  Shield,
  ArrowLeft,
  KeyRound,
  Zap,
  Lock,
  ShieldCheck,
  Activity,
  AlertOctagon,
} from "lucide-react";
import { useAuthStore } from "../stores/useAuthStore";
import { Button, Card, CardContent } from "../components/ui";

export function LoginPage() {
  const navigate = useNavigate();
  const [tokenInput, setTokenInput] = useState("");
  const login = useAuthStore((s) => s.login);
  const loginDevSession = useAuthStore((s) => s.loginDevSession);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isDevEnv = useAuthStore((s) => s.isDevEnv);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);

  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    const ok = await login(tokenInput);
    if (ok) {
      navigate("/app");
    }
  };

  const handleDevSession = async () => {
    const ok = await loginDevSession();
    if (ok) {
      navigate("/app");
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col lg:flex-row">
      {/* Left Brand Panel (Desktop) */}
      <div className="hidden lg:flex lg:w-1/2 p-12 bg-slate-900/40 border-r border-white/[0.08] flex-col justify-between relative overflow-hidden">
        {/* Ambient Glow */}
        <div className="absolute top-1/4 left-1/4 w-[450px] h-[450px] bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-blue-600/10 blur-[100px] rounded-full pointer-events-none" />

        {/* Back Link & Brand */}
        <div className="relative z-10">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-mono text-slate-400 hover:text-cyan-400 transition-colors focus-ring rounded mb-8"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Public Landing</span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(56,189,248,0.2)]">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold font-display text-slate-100">Prahari Console</h2>
              <p className="text-xs font-mono text-slate-400">Agent Governance Mission Control</p>
            </div>
          </div>
        </div>

        {/* Invariant Value Props */}
        <div className="relative z-10 space-y-4 max-w-md my-auto">
          <h1 className="text-3xl font-bold font-display text-slate-100 leading-tight">
            Deterministic governance for autonomous agent tool calls.
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Real-time policy interception, capability grant isolation, and cryptographically chained audit trails.
          </p>

          <div className="pt-6 space-y-3">
            <div className="flex items-center gap-3 text-xs font-mono text-slate-300">
              <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Fail-Closed Gateway: Engine errors default to Deny</span>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono text-slate-300">
              <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>In-Memory Auth: Admin keys never touch disk storage</span>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono text-slate-300">
              <Activity className="w-4 h-4 text-purple-400 shrink-0" />
              <span>SHA-256 HMAC Checkpointed Audit Ledger</span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="relative z-10 text-[11px] font-mono text-slate-500 flex items-center justify-between">
          <span>Prahari v0.1.0-prealpha</span>
          <span>DPDP Evidence Telemetry</span>
        </div>
      </div>

      {/* Right Login Form Card */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12 relative">
        <div className="w-full max-w-md">
          {/* Mobile Back Link */}
          <div className="lg:hidden mb-6">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-xs font-mono text-slate-400 hover:text-cyan-400 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Public Landing</span>
            </Link>
          </div>

          <Card variant="elevated" className="border-white/10 bg-slate-900/80 backdrop-blur-xl">
            <CardContent className="p-8">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 mb-3 shadow-[0_0_15px_rgba(56,189,248,0.2)]">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold font-display text-slate-100">Operator Sign In</h2>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  Authenticate with Operator Admin Token
                </p>
              </div>

              {/* Error Notice */}
              {error && (
                <div
                  data-testid="login-error"
                  className="mb-6 p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs font-mono flex items-start gap-2.5 animate-in fade-in"
                >
                  <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Admin Login Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label
                    htmlFor="admin-token"
                    className="block text-xs font-mono text-slate-300 mb-2 uppercase tracking-wider"
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
                    autoComplete="current-password"
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-950 border border-white/15 text-slate-100 placeholder-slate-600 text-sm font-mono focus-ring focus:border-cyan-400 transition-all"
                  />
                </div>

                <Button
                  type="submit"
                  data-testid="submit-login"
                  variant="primary"
                  size="lg"
                  className="w-full"
                  isLoading={isLoading}
                  disabled={isLoading || !tokenInput.trim()}
                >
                  {isLoading ? "Authenticating..." : "Sign In to Console"}
                </Button>
              </form>

              {/* Dev Session Bypass */}
              {isDevEnv && (
                <div className="mt-8 pt-6 border-t border-white/[0.08]">
                  <div className="text-center mb-3">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                      Development Mode Detected
                    </span>
                  </div>
                  <Button
                    type="button"
                    data-testid="dev-session-button"
                    variant="outline"
                    size="md"
                    onClick={handleDevSession}
                    disabled={isLoading}
                    className="w-full text-xs font-mono border-white/15 hover:border-amber-400/40 text-slate-300 hover:text-amber-300"
                    leftIcon={<Zap className="w-3.5 h-3.5 text-amber-400" />}
                  >
                    Launch via Dev-Session Bypass
                  </Button>
                </div>
              )}

              {/* Security Invariant Footer */}
              <div className="mt-8 pt-4 border-t border-white/[0.04] text-center">
                <p className="text-[11px] text-slate-500 font-mono leading-relaxed">
                  Memory-Only Invariant: Session keys are kept in volatile memory and never persisted to browser localStorage or cookies.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
