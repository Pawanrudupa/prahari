import { describe, it, expect } from "vitest";
import {
  evaluateBezier,
  computeTrajectoryControlPoint,
  OUTCOME_VISUAL_MAP,
  ParticlePoolManager,
} from "../utils/particleMath";
import type { DecisionOutcome } from "../types/graph";

describe("Particle Math & Outcome Trajectories", () => {
  const p0: [number, number, number] = [4.5, 0, 0]; // Agent on inner ring
  const p1: [number, number, number] = [14.0, 0, 0]; // Tool on outer ring

  it("evaluates quadratic Bézier accurately at boundary and midpoint parameters", () => {
    const pCtrl = computeTrajectoryControlPoint(p0, p1);

    const startPt = evaluateBezier(p0, pCtrl, p1, 0.0);
    const endPt = evaluateBezier(p0, pCtrl, p1, 1.0);
    const midPt = evaluateBezier(p0, pCtrl, p1, 0.5);

    expect(startPt[0]).toBeCloseTo(p0[0], 4);
    expect(startPt[1]).toBeCloseTo(p0[1], 4);
    expect(startPt[2]).toBeCloseTo(p0[2], 4);

    expect(endPt[0]).toBeCloseTo(p1[0], 4);
    expect(endPt[1]).toBeCloseTo(p1[1], 4);
    expect(endPt[2]).toBeCloseTo(p1[2], 4);

    // Midpoint arcs upwards in Y
    expect(midPt[1]).toBeGreaterThan(0);
  });

  it("ensures all 4 outcomes map to distinct visual colors, shapes, and icons (never color alone)", () => {
    const outcomes: DecisionOutcome[] = ["allow", "deny", "redact", "escalate"];
    const colors = new Set<string>();
    const shapes = new Set<string>();
    const icons = new Set<string>();

    for (const outcome of outcomes) {
      const visual = OUTCOME_VISUAL_MAP[outcome];
      expect(visual.outcome).toBe(outcome);
      expect(visual.colorHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(visual.shape).toBeDefined();
      expect(visual.icon).toBeDefined();

      colors.add(visual.colorHex);
      shapes.add(visual.shape);
      icons.add(visual.icon);
    }

    expect(colors.size).toBe(4);
    expect(shapes.size).toBe(4);
    expect(icons.size).toBe(4);
  });

  it("deny outcome halts at policy shield and never reaches the tool", () => {
    const manager = new ParticlePoolManager(10);
    const slot = manager.spawn(p0, p1, "deny", 1000, 1000);
    expect(slot).not.toBeNull();
    if (!slot) return;

    expect(slot.phase).toBe("inbound");

    // Advance to shield arrival time
    const timeToShield = slot.durationMs * slot.shieldT;
    manager.update(timeToShield + 10);

    // Should have transitioned to burst at the shield
    expect(slot.phase).toBe("burst");
    expect(slot.t).toBeCloseTo(slot.shieldT, 2);
    expect(slot.burstVelocities).toBeDefined();
    expect(slot.burstVelocities?.length).toBe(8);

    // Advance beyond total duration: burst completes and particle deactivates
    manager.update(700);
    expect(slot.active).toBe(false);
    expect(slot.phase).toBe("expired");
    // Crucial check: parameter t NEVER reached 1.0 (tool position)
    expect(slot.t).toBeLessThan(0.9);
  });

  it("allow outcome passes cleanly through the shield and completes at tool", () => {
    const manager = new ParticlePoolManager(10);
    const slot = manager.spawn(p0, p1, "allow", 1000, 1000);
    expect(slot).not.toBeNull();
    if (!slot) return;

    // Advance 50%
    manager.update(500);
    expect(slot.active).toBe(true);
    expect(slot.t).toBeCloseTo(0.5, 1);

    // Advance to completion
    manager.update(600);
    expect(slot.active).toBe(false);
    expect(slot.phase).toBe("expired");
  });

  it("redact outcome pulses amber around shield penetration and continues to tool", () => {
    const manager = new ParticlePoolManager(10);
    const slot = manager.spawn(p0, p1, "redact", 1000, 1000);
    expect(slot).not.toBeNull();
    if (!slot) return;

    // Advance to near shield
    const timeToShield = slot.durationMs * slot.shieldT;
    manager.update(timeToShield);
    expect(slot.phase).toBe("holding"); // pulse phase
    expect(slot.scale).toBeGreaterThan(1.2);

    // Continue to completion
    manager.update(1000);
    expect(slot.active).toBe(false);
  });

  it("escalate outcome holds at the shield boundary and expires after timeout (capped at 10s)", () => {
    const manager = new ParticlePoolManager(10);
    const slot = manager.spawn(p0, p1, "escalate", 1000, 1000);
    expect(slot).not.toBeNull();
    if (!slot) return;

    // Advance to shield
    const timeToShield = slot.durationMs * slot.shieldT;
    manager.update(timeToShield + 10);
    expect(slot.phase).toBe("holding");

    // Hold for 4 seconds -> should still be holding
    manager.update(4000);
    expect(slot.phase).toBe("holding");
    expect(slot.active).toBe(true);

    // Hold exceeds 5s default timeout -> deactivates
    manager.update(1200);
    expect(slot.active).toBe(false);
    expect(slot.phase).toBe("expired");
  });
});
