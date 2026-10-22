import { useEffect, Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "./stores/useAuthStore";

// Route-level code splitting: Landing page never bundles console code
const LandingPage = lazy(() =>
  import("./pages/landing/LandingPage").then((m) => ({ default: m.LandingPage })),
);
const LoginPage = lazy(() =>
  import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const AppShell = lazy(() =>
  import("./components/layout/AppShell").then((m) => ({ default: m.AppShell })),
);
const Constellation = lazy(() =>
  import("./scenes/Constellation").then((m) => ({ default: m.Constellation })),
);
const TestEffectsPanel = lazy(() =>
  import("./components/controls/TestEffectsPanel").then((m) => ({ default: m.TestEffectsPanel })),
);
const AgentsPage = lazy(() =>
  import("./pages/agents/AgentsPage").then((m) => ({ default: m.AgentsPage })),
);
const DecisionsPage = lazy(() =>
  import("./pages/decisions/DecisionsPage").then((m) => ({ default: m.DecisionsPage })),
);
const ApprovalsPage = lazy(() =>
  import("./pages/approvals/ApprovalsPage").then((m) => ({ default: m.ApprovalsPage })),
);
const PolicyStudioPage = lazy(() =>
  import("./pages/policies/PolicyStudioPage").then((m) => ({ default: m.PolicyStudioPage })),
);
const SessionDagPage = lazy(() =>
  import("./pages/sessions/SessionDagPage").then((m) => ({ default: m.SessionDagPage })),
);
const SettingsPage = lazy(() =>
  import("./pages/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);

const queryClient = new QueryClient();

function RouteLoadingFallback() {
  return (
    <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center text-xs font-mono text-slate-500">
      Loading Prahari Console...
    </div>
  );
}

function ProtectedAppRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppShell>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <Constellation />
                <TestEffectsPanel />
              </>
            }
          />
          <Route
            path="/constellation"
            element={
              <>
                <Constellation />
                <TestEffectsPanel />
              </>
            }
          />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/decisions" element={<DecisionsPage />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          <Route path="/policies" element={<PolicyStudioPage />} />
          <Route path="/sessions" element={<SessionDagPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

export function App() {
  const checkDevAvailability = useAuthStore((s) => s.checkDevAvailability);

  useEffect(() => {
    checkDevAvailability();
  }, [checkDevAvailability]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            {/* Public standalone Landing Page */}
            <Route path="/" element={<LandingPage />} />

            {/* Public Login Route */}
            <Route path="/login" element={<LoginPage />} />

            {/* Authenticated Console Routes */}
            <Route path="/app/*" element={<ProtectedAppRoute />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
