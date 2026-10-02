import { describe, it, expect } from "vitest";
import {
  ParticlePoolManager,
  MAX_PARTICLE_POOL_SIZE,
  MAX_ACTIVE_ESCALATIONS,
} from "../utils/particleMath";

describe("Particle Pool Allocation & Overflow Policy", () => {
  const p0: [number, number, number] = [4.5, 0, 0];
  const p1: [number, number, number] = [14.0, 0, 0];

  it("enforces strict pool capacity bounds of 500 slots", () => {
    const manager = new ParticlePoolManager(MAX_PARTICLE_POOL_SIZE);
    expect(manager.getCapacity()).toBe(500);
    expect(manager.getActiveCount()).toBe(0);

    for (let i = 0; i < 500; i++) {
      manager.spawn(p0, p1, "allow", 1000 + i);
    }

    expect(manager.getActiveCount()).toBe(500);
  });

  it("recycles inactive slots when particles expire", () => {
    const manager = new ParticlePoolManager(10);

    // Spawn 10 particles
    for (let i = 0; i < 10; i++) {
      manager.spawn(p0, p1, "allow", 1000 + i, 500);
    }
    expect(manager.getActiveCount()).toBe(10);

    // Advance beyond duration to expire them
    manager.update(600);
    expect(manager.getActiveCount()).toBe(0);

    // Can allocate again into recycled slots
    for (let i = 0; i < 10; i++) {
      const slot = manager.spawn(p0, p1, "allow", 2000 + i, 500);
      expect(slot).not.toBeNull();
    }
    expect(manager.getActiveCount()).toBe(10);
  });

  it("evicts oldest allow particles first when 500 slots are full during a large burst", () => {
    const manager = new ParticlePoolManager(MAX_PARTICLE_POOL_SIZE);

    // 1. Fill pool with 500 'allow' particles
    for (let i = 0; i < 500; i++) {
      manager.spawn(p0, p1, "allow", 1000 + i, 20000); // long duration
    }
    expect(manager.getActiveCount()).toBe(500);

    // Check oldest birth time
    const oldestSlotBefore = manager.getAllSlots().find((s) => s.birthTime === 1000);
    expect(oldestSlotBefore).toBeDefined();

    // 2. Burst 150 new particles (well above pool size: 650 total events)
    for (let i = 0; i < 150; i++) {
      const slot = manager.spawn(p0, p1, "allow", 5000 + i, 20000);
      expect(slot).not.toBeNull();
    }

    // Active count remains at 500 (bounds preserved)
    expect(manager.getActiveCount()).toBe(500);

    // The oldest particles from initial fill (birthTime 1000..1149) have been evicted
    const evicted = manager.getAllSlots().filter((s) => s.active && s.birthTime < 1150);
    expect(evicted.length).toBe(0);

    // The newest burst particles (birthTime 5000..5149) are active
    const newest = manager.getAllSlots().filter((s) => s.active && s.birthTime >= 5000);
    expect(newest.length).toBe(150);
  });

  it("NEVER evicts deny, redact, or escalate particles during pool overflow", () => {
    const manager = new ParticlePoolManager(500);

    // 1. Fill 450 slots with critical non-allow events (150 deny, 150 redact, 150 escalate)
    for (let i = 0; i < 150; i++) {
      manager.spawn(p0, p1, "deny", 1000 + i, 30000);
    }
    for (let i = 0; i < 150; i++) {
      manager.spawn(p0, p1, "redact", 2000 + i, 30000);
    }
    // Note: escalate capped at 50
    for (let i = 0; i < 50; i++) {
      manager.spawn(p0, p1, "escalate", 3000 + i, 30000);
    }

    // Fill the remaining 150 slots with allow particles
    for (let i = 0; i < 150; i++) {
      manager.spawn(p0, p1, "allow", 4000 + i, 30000);
    }

    expect(manager.getActiveCount()).toBe(500);

    // Count non-allow particles before burst
    const denyBefore = manager.getAllSlots().filter((s) => s.active && s.outcome === "deny").length;
    const redactBefore = manager.getAllSlots().filter((s) => s.active && s.outcome === "redact").length;
    const escalateBefore = manager.getAllSlots().filter((s) => s.active && s.outcome === "escalate").length;

    expect(denyBefore).toBe(150);
    expect(redactBefore).toBe(150);
    expect(escalateBefore).toBe(50);

    // 2. Burst 100 new deny and redact particles
    for (let i = 0; i < 50; i++) {
      manager.spawn(p0, p1, "deny", 6000 + i, 30000);
      manager.spawn(p0, p1, "redact", 7000 + i, 30000);
    }

    // Active count stays at 500
    expect(manager.getActiveCount()).toBe(500);

    // All original non-allow particles (deny, redact, escalate) are intact!
    const originalDeny = manager.getAllSlots().filter(
      (s) => s.active && s.outcome === "deny" && s.birthTime < 2000,
    ).length;
    const originalRedact = manager.getAllSlots().filter(
      (s) => s.active && s.outcome === "redact" && s.birthTime >= 2000 && s.birthTime < 3000,
    ).length;
    const originalEscalate = manager.getAllSlots().filter(
      (s) => s.active && s.outcome === "escalate" && s.birthTime >= 3000 && s.birthTime < 4000,
    ).length;

    expect(originalDeny).toBe(150);
    expect(originalRedact).toBe(150);
    expect(originalEscalate).toBe(50);

    // The evicted particles were strictly 'allow' particles
    const remainingAllow = manager.getAllSlots().filter(
      (s) => s.active && s.outcome === "allow",
    ).length;
    expect(remainingAllow).toBe(50); // 150 - 100 evicted = 50 remaining
  });

  it("enforces global cap of 50 active escalations", () => {
    const manager = new ParticlePoolManager(100);

    // Spawn 70 escalations
    for (let i = 0; i < 70; i++) {
      manager.spawn(p0, p1, "escalate", 1000 + i, 10000);
    }

    // Active escalations count must never exceed MAX_ACTIVE_ESCALATIONS (50)
    expect(manager.getActiveEscalationsCount()).toBe(MAX_ACTIVE_ESCALATIONS);
    expect(manager.getActiveCount()).toBe(50);
  });
});
