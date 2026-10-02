import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { App } from "../App";
import { useAuthStore } from "../stores/useAuthStore";

describe("App Component Routing & Shell", () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
    window.history.pushState({}, "", "/");
  });

  it("renders Public LandingPage by default at /", async () => {
    render(<App />);
    expect(
      await screen.findByText(/A sentinel for/i, {}, { timeout: 8000 }),
    ).toBeInTheDocument();

    const launchBtns = await screen.findAllByRole(
      "button",
      { name: /launch console/i },
      { timeout: 8000 },
    );
    expect(launchBtns.length).toBeGreaterThanOrEqual(1);

    expect(
      await screen.findByRole("button", { name: /watch how it works/i }, { timeout: 8000 }),
    ).toBeInTheDocument();
  }, 10000);

  it("renders LoginPage when navigated to /login", async () => {
    window.history.pushState({}, "", "/login");
    render(<App />);
    expect(
      await screen.findByText("Operator Sign In", {}, { timeout: 8000 }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /sign in to console/i }, { timeout: 8000 }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("admin-token-input")).toBeInTheDocument();
  }, 10000);

  it("renders AppShell and navigation rail when authenticated at /app", async () => {
    useAuthStore.setState({
      sessionToken: "mock-token",
      isAuthenticated: true,
      mode: "admin",
    });
    window.history.pushState({}, "", "/app");

    render(<App />);
    expect(
      await screen.findByText("PRAHARI", {}, { timeout: 8000 }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("ADMIN", {}, { timeout: 8000 }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("logout-button")).toBeInTheDocument();
  }, 10000);
});
