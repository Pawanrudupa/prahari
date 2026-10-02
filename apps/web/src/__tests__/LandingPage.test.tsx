import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { LandingPage } from "../pages/landing/LandingPage";

describe("LandingPage Component", () => {
  it("renders hero headline, problem section, and feature grid", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/A sentinel for/i)).toBeInTheDocument();
    expect(screen.getByText(/Traditional API gateways were built/i)).toBeInTheDocument();
    expect(screen.getByText(/Determinism over heuristics/i)).toBeInTheDocument();
    expect(screen.getByText(/Enterprise-grade governance capabilities/i)).toBeInTheDocument();
  });
});
