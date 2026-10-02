import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  Panel,
  StatTile,
  Kbd,
  EmptyState,
} from "../components/ui";

describe("Design System Primitives", () => {
  it("renders Button with proper classes and disabled state", () => {
    const { rerender } = render(<Button variant="primary">Launch</Button>);
    const btn = screen.getByRole("button", { name: /launch/i });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain("bg-cyan-500");

    rerender(<Button variant="danger" disabled>Destructive</Button>);
    const disabledBtn = screen.getByRole("button", { name: /destructive/i });
    expect(disabledBtn).toBeDisabled();
    expect(disabledBtn.className).toContain("disabled:opacity-50");
  });

  it("renders Badge variants with icon and color without emojis", () => {
    const { container } = render(
      <div>
        <Badge variant="allow">ALLOWED</Badge>
        <Badge variant="deny">DENIED</Badge>
        <Badge variant="redact">REDACTED</Badge>
        <Badge variant="escalate">ESCALATED</Badge>
      </div>,
    );
    expect(screen.getByText("ALLOWED")).toBeInTheDocument();
    expect(screen.getByText("DENIED")).toBeInTheDocument();
    expect(screen.getByText("REDACTED")).toBeInTheDocument();
    expect(screen.getByText("ESCALATED")).toBeInTheDocument();

    // Verify SVG icons exist for each badge (no raw emojis)
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBe(4);
  });

  it("renders StatTile with label, value and trend", () => {
    render(
      <StatTile
        label="Gateway Latency"
        value="18.2 ms"
        trend={{ value: "-4.2%", positive: true }}
        subtext="p95 SLA: <50ms"
      />,
    );
    expect(screen.getByText("Gateway Latency")).toBeInTheDocument();
    expect(screen.getByText("18.2 ms")).toBeInTheDocument();
    expect(screen.getByText("-4.2%")).toBeInTheDocument();
    expect(screen.getByText("p95 SLA: <50ms")).toBeInTheDocument();
  });

  it("renders Kbd keyboard shortcut pill", () => {
    render(<Kbd>Ctrl + K</Kbd>);
    expect(screen.getByText("Ctrl + K")).toBeInTheDocument();
  });

  it("renders Card and Panel with glassmorphism classes", () => {
    const { container } = render(
      <Panel>
        <Card variant="interactive">
          <CardHeader>
            <CardTitle>Mission Control</CardTitle>
          </CardHeader>
        </Card>
      </Panel>,
    );
    expect(screen.getByText("Mission Control")).toBeInTheDocument();
    expect(container.querySelector(".glass-panel, .backdrop-blur-xl")).not.toBeNull();
  });

  it("renders EmptyState with action button", () => {
    render(
      <EmptyState
        title="No Incidents Detected"
        description="All agent tool calls comply with active governance policies."
        action={<Button variant="outline">Run simulator</Button>}
      />,
    );
    expect(screen.getByText("No Incidents Detected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run simulator/i })).toBeInTheDocument();
  });
});
