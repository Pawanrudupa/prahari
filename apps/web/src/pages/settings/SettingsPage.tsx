import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Monitor,
  Cpu,
  Eye,
  Shield,
  LogOut,
  Info,
  CheckCircle2,
  Sparkles,
  Sliders,
} from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import { useAppStore } from "../../stores/appStore";
import { isWebGLAvailable } from "../../utils/webgl";

export function SettingsPage() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const mode = useAuthStore((s) => s.mode);
  const sessionToken = useAuthStore((s) => s.sessionToken);

  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const setReducedMotion = useAppStore((s) => s.setReducedMotion);
  const qualityMode = useAppStore((s) => s.qualityMode);
  const setQualityMode = useAppStore((s) => s.setQualityMode);

  const [gpuInfo, setGpuInfo] = useState<string>("Detecting GPU...");
  const [copiedSession, setCopiedSession] = useState(false);

  useEffect(() => {
    if (!isWebGLAvailable()) {
      setGpuInfo("Software Renderer (WebGL unavailable)");
      return;
    }
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (gl) {
        const debugInfo = (gl as any).getExtension("WEBGL_debug_renderer_info");
        if (debugInfo) {
          const renderer = (gl as any).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          if (renderer) {
            setGpuInfo(renderer);
            return;
          }
        }
      }
      setGpuInfo("Hardware Accelerated (WebGL 2.0)");
    } catch {
      setGpuInfo("Generic WebGL Pipeline");
    }
  }, []);

  const handleSignOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const handleCopyTokenDigest = async () => {
    if (!sessionToken) return;
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(sessionToken);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      await navigator.clipboard.writeText(`sha256:${hashHex.slice(0, 16)}...`);
      setCopiedSession(true);
      setTimeout(() => setCopiedSession(false), 2000);
    } catch {
      // Fallback
      setCopiedSession(false);
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-slate-950 p-6 md:p-8 font-sans text-slate-100">
      <div className="max-w-4xl mx-auto space-y-8 pb-12">
        {/* Header */}
        <div className="border-b border-white/[0.08] pb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Console Settings</h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Graphics quality presets, accessibility, mission control preferences, and active session telemetry.
              </p>
            </div>
          </div>
        </div>

        {/* Section 1: Graphics & Performance */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              Graphics & Performance
            </h2>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-5 backdrop-blur-md space-y-6">
            {/* GPU Hardware string */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-white/[0.06]">
              <div>
                <div className="text-sm font-medium text-slate-200">Active WebGL Renderer</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Hardware device identified by the browser graphics pipeline.
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-cyan-300 max-w-sm truncate">
                <Cpu className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="truncate" title={gpuInfo}>{gpuInfo}</span>
              </div>
            </div>

            {/* Quality Preset */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/[0.06]">
              <div>
                <div className="text-sm font-medium text-slate-200">Scene Fidelity Preset</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Controls bloom postprocessing, particle simulation fidelity, and mesh antialiasing.
                </div>
              </div>
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10">
                {(["auto", "high", "low"] as const).map((modeKey) => (
                  <button
                    key={modeKey}
                    onClick={() => setQualityMode(modeKey)}
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition cursor-pointer capitalize ${
                      qualityMode === modeKey
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.2)]"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {modeKey === "auto" ? "Auto (Dynamic)" : modeKey === "high" ? "High (Full)" : "Low (Power Save)"}
                  </button>
                ))}
              </div>
            </div>

            {/* Reduced Motion Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-slate-200">Reduced Motion</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Disables orbital camera transitions, burst physics, and pulsating glow rings.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReducedMotion(!reducedMotion)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/50 cursor-pointer ${
                  reducedMotion ? "bg-cyan-500" : "bg-slate-700"
                }`}
                role="switch"
                aria-checked={reducedMotion}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    reducedMotion ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Section 2: Appearance */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              Appearance & Palette
            </h2>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-5 backdrop-blur-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-slate-200">Interface Theme</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  High-contrast mission control dark mode (WCAG AA compliant).
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Dark Theme Active
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  (Light mode: Roadmap)
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Session & Access */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              Session & Access Control
            </h2>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-5 backdrop-blur-md space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/[0.06]">
              <div>
                <div className="text-sm font-medium text-slate-200">Active Authentication Role</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Permissions scope for policy actuation and key operations.
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-xs font-mono text-cyan-300 font-semibold uppercase">
                {mode === "development-bypass" ? "Development Bypass" : "Admin Operator"}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/[0.06]">
              <div>
                <div className="text-sm font-medium text-slate-200">Session Token Digest</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Cryptographic session bearer token stored in ephemeral app memory.
                </div>
              </div>
              <button
                onClick={handleCopyTokenDigest}
                disabled={!sessionToken}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 hover:border-cyan-500/30 text-xs font-mono text-slate-300 hover:text-cyan-300 transition cursor-pointer disabled:opacity-40"
              >
                {copiedSession ? "Copied Digest!" : "Copy Dev Session Digest"}
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-rose-300">Terminate Active Session</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Revokes current memory token and redirects back to the sign-in portal.
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 hover:text-rose-200 text-xs font-mono font-semibold transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out Console
              </button>
            </div>
          </div>
        </section>

        {/* Section 4: About & Governance Notices */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              System Specification & Notices
            </h2>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-5 backdrop-blur-md space-y-4 text-xs text-slate-400">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-white/[0.06] font-mono">
              <div>
                <span className="text-slate-500">Platform:</span>{" "}
                <span className="text-slate-200">Prahari Sentinel Core</span>
              </div>
              <div>
                <span className="text-slate-500">Version:</span>{" "}
                <span className="text-cyan-300">0.1.0-alpha (pre-alpha)</span>
              </div>
              <div>
                <span className="text-slate-500">Decision Engine:</span>{" "}
                <span className="text-slate-200">Deterministic Policy + Fail-Closed Hard Limits</span>
              </div>
              <div>
                <span className="text-slate-500">Audit Ledger:</span>{" "}
                <span className="text-slate-200">SHA-256 Hash Chain (Append-only)</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-2">
              <div className="flex items-center gap-1.5 text-amber-400/90 font-medium">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>Statutory & Compliance Disclaimer</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">
                Prahari features (including DPDP data-class tagging, PII masking, and audit hash verification)
                are provided strictly for telemetry, evidence generation, and automated policy enforcement. Prahari does not
                constitute legal compliance certification under the Digital Personal Data Protection (DPDP) Act or GDPR.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
