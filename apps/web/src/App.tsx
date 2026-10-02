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
      <Routes>
        <Route path="/" element={<Constellation />} />
        <Route path="/constellation" element={<Constellation />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
      <TestEffectsPanel />
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
