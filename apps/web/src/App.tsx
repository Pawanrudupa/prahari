import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./components/layout/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { Constellation } from "./scenes/Constellation";
import { useAuthStore } from "./stores/useAuthStore";

const queryClient = new QueryClient();

export function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const checkDevAvailability = useAuthStore((s) => s.checkDevAvailability);

  useEffect(() => {
    checkDevAvailability();
  }, [checkDevAvailability]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {!isAuthenticated ? (
          <LoginPage />
        ) : (
          <AppShell>
            <Routes>
              <Route path="/" element={<Constellation />} />
            </Routes>
          </AppShell>
        )}
      </BrowserRouter>
    </QueryClientProvider>
  );
}

