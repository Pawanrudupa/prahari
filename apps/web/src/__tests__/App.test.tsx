import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { App } from "../App";
import { useAuthStore } from "../stores/useAuthStore";

describe("App Component", () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
  });

  it("renders LoginPage with title when unauthenticated", async () => {
    await act(async () => {
      render(<App />);
    });
    expect(screen.getByText("Prahari")).toBeInTheDocument();
    expect(screen.getByText("Sign In to Console")).toBeInTheDocument();
  });

  it("renders AppShell and navigation rail when authenticated", async () => {
    useAuthStore.setState({
      sessionToken: "mock-token",
      isAuthenticated: true,
      mode: "admin",
    });

    await act(async () => {
      render(<App />);
    });
    expect(screen.getByText("PRAHARI")).toBeInTheDocument();
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
    expect(screen.getByTestId("logout-button")).toBeInTheDocument();
  });
});
