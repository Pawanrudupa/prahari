import type { DecisionOutcome } from "../types/graph";
import { SHIELD_RADIUS } from "./layout";

export const MAX_PARTICLE_POOL_SIZE = 500;
export const MAX_ACTIVE_ESCALATIONS = 50;
export const DEFAULT_ESCALATE_HOLD_MS = 5000;
export const MAX_ESCALATE_HOLD_MS = 10000;

export interface OutcomeVisualConfig {
  outcome: DecisionOutcome;
  label: string;
  colorHex: string;
  colorRgb: [number, number, number];
  shape: "stream" | "burst-shard" | "diamond" | "pulsing-ring";
  shapeCode: number; // 0=stream, 1=burst-shard, 2=diamond, 3=pulsing-ring
  icon: string;
}

export const OUTCOME_VISUAL_MAP: Record<DecisionOutcome, OutcomeVisualConfig> = {
  allow: {
    outcome: "allow",
    label: "Allow",
    colorHex: "#2DD4A7",
    colorRgb: [0.176, 0.831, 0.655], // Emerald
    shape: "stream",
    shapeCode: 0,
    icon: "check-circle",
  },
  deny: {
    outcome: "deny",
    label: "Deny",
    colorHex: "#F43F5E",
    colorRgb: [0.957, 0.247, 0.369], // Rose/Red
    shape: "burst-shard",
    shapeCode: 1,
    icon: "x-circle",
  },
  redact: {
    outcome: "redact",
    label: "Redact",
    colorHex: "#FBBF24",
    colorRgb: [0.984, 0.749, 0.141], // Amber
    shape: "diamond",
    shapeCode: 2,
    icon: "shield-alert",
  },
  escalate: {
    outcome: "escalate",
    label: "Escalate",
    colorHex: "#A78BFA",
    colorRgb: [0.655, 0.545, 0.980], // Violet
    shape: "pulsing-ring",
    shapeCode: 3,
    icon: "hand",
  },
};

/**
 * Computes a 3D point along a quadratic Bézier curve.
 */
export function evaluateBezier(
  p0: [number, number, number],
  pCtrl: [number, number, number],
  p1: [number, number, number],
  t: number,
): [number, number, number] {
  const clampedT = Math.max(0, Math.min(1, t));
  const u = 1 - clampedT;
  const tt = clampedT * clampedT;
  const uu = u * u;
  const ut2 = 2 * u * clampedT;

  const x = uu * p0[0] + ut2 * pCtrl[0] + tt * p1[0];
  const y = uu * p0[1] + ut2 * pCtrl[1] + tt * p1[1];
  const z = uu * p0[2] + ut2 * pCtrl[2] + tt * p1[2];

  return [x, y, z];
}

/**
 * Computes the control point for a trajectory passing near/through the central policy shield.
 */
export function computeTrajectoryControlPoint(
  p0: [number, number, number],
  p1: [number, number, number],
): [number, number, number] {
  // Midpoint pulled inward toward shield center with upward arc
  const midX = (p0[0] + p1[0]) * 0.5;
  const midY = (p0[1] + p1[1]) * 0.5;
  const midZ = (p0[2] + p1[2]) * 0.5;

  const pullToCenter = 0.35;
  const arcY = 1.8;

  return [
    midX * pullToCenter,
    midY * pullToCenter + arcY,
    midZ * pullToCenter,
  ];
}

/**
 * Determines the parameter t (approximate) where the trajectory meets the shield radius.
 */
export function estimateShieldIntersectionT(
  p0: [number, number, number],
  pCtrl: [number, number, number],
  p1: [number, number, number],
  shieldRadius: number = SHIELD_RADIUS,
): number {
  // Sample along curve to find entry point where radius <= shieldRadius or closest approach
  let bestT = 0.45;
  let minDiff = Infinity;

  const steps = 20;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const pt = evaluateBezier(p0, pCtrl, p1, t);
    const dist = Math.hypot(pt[0], pt[1], pt[2]);
    const diff = Math.abs(dist - shieldRadius);
    if (diff < minDiff) {
      minDiff = diff;
      bestT = t;
    }
  }

  return bestT;
}

export type ParticlePhase = "inbound" | "holding" | "burst" | "outbound" | "expired";

export interface ParticleSlot {
  slotIndex: number;
  active: boolean;
  birthTime: number;
  outcome: DecisionOutcome;
  p0: [number, number, number];
  pCtrl: [number, number, number];
  p1: [number, number, number];
  currentPos: [number, number, number];
  t: number; // 0.0 to 1.0 along bezier
  durationMs: number;
  elapsedMs: number;
  phase: ParticlePhase;
  shieldT: number;
  holdDurationMs: number;
  holdElapsedMs: number;
  scale: number;
  // Shard velocities for burst (if deny)
  burstVelocities?: [number, number, number][];
}

/**
 * Manages allocation and lifecycle of the preallocated 500-particle pool.
 * Implements strict overflow eviction policy:
 * - Drops oldest 'allow' particles first.
 * - NEVER drops 'deny', 'redact', or 'escalate' particles.
 * - Caps active escalations to MAX_ACTIVE_ESCALATIONS (50).
 */
export class ParticlePoolManager {
  private slots: ParticleSlot[];
  private maxCapacity: number;

  constructor(capacity: number = MAX_PARTICLE_POOL_SIZE) {
    this.maxCapacity = capacity;
    this.slots = Array.from({ length: capacity }, (_, i) => ({
      slotIndex: i,
      active: false,
      birthTime: 0,
      outcome: "allow",
      p0: [0, 0, 0],
      pCtrl: [0, 0, 0],
      p1: [0, 0, 0],
      currentPos: [0, 0, 0],
      t: 0,
      durationMs: 1200,
      elapsedMs: 0,
      phase: "expired",
      shieldT: 0.45,
      holdDurationMs: DEFAULT_ESCALATE_HOLD_MS,
      holdElapsedMs: 0,
      scale: 1.0,
    }));
  }

  public getCapacity(): number {
    return this.maxCapacity;
  }

  public getActiveCount(): number {
    return this.slots.filter((s) => s.active).length;
  }

  public getActiveEscalationsCount(): number {
    return this.slots.filter((s) => s.active && s.outcome === "escalate").length;
  }

  public getSlot(index: number): ParticleSlot {
    return this.slots[index]!;
  }

  public getAllSlots(): readonly ParticleSlot[] {
    return this.slots;
  }

  /**
   * Spawns a new particle for a decision event.
   * If pool is full, evicts according to overflow policy.
   */
  public spawn(
    p0: [number, number, number],
    p1: [number, number, number],
    outcome: DecisionOutcome,
    now: number = Date.now(),
    baseDurationMs: number = 1200,
  ): ParticleSlot | null {
    // If outcome is escalate, enforce global cap of 50
    if (outcome === "escalate" && this.getActiveEscalationsCount() >= MAX_ACTIVE_ESCALATIONS) {
      // Find oldest active escalate and expire it to make room
      const oldestEscalate = this.findOldestByOutcome("escalate");
      if (oldestEscalate) {
        this.deactivateSlot(oldestEscalate);
      }
    }

    let targetSlot = this.slots.find((s) => !s.active);

    if (!targetSlot) {
      // POOL OVERFLOW: Evict oldest 'allow' particle
      const oldestAllow = this.findOldestByOutcome("allow");
      if (oldestAllow) {
        this.deactivateSlot(oldestAllow);
        targetSlot = oldestAllow;
      } else {
        // No allow particle found in full pool:
        // Never drop deny, redact, or escalate! If incoming is allow, drop incoming.
        if (outcome === "allow") {
          return null; // Reject new allow particle
        }
        // If incoming is high-priority (deny/redact/escalate), check for any expired burst
        const expiredBurst = this.slots.find(
          (s) => s.phase === "burst" && s.elapsedMs > s.durationMs * 0.8,
        );
        if (expiredBurst) {
          this.deactivateSlot(expiredBurst);
          targetSlot = expiredBurst;
        } else {
          return null;
        }
      }
    }

    const pCtrl = computeTrajectoryControlPoint(p0, p1);
    const shieldT = estimateShieldIntersectionT(p0, pCtrl, p1);

    targetSlot.active = true;
    targetSlot.birthTime = now;
    targetSlot.outcome = outcome;
    targetSlot.p0 = p0;
    targetSlot.pCtrl = pCtrl;
    targetSlot.p1 = p1;
    targetSlot.currentPos = [...p0];
    targetSlot.t = 0;
    targetSlot.durationMs = baseDurationMs;
    targetSlot.elapsedMs = 0;
    targetSlot.phase = "inbound";
    targetSlot.shieldT = shieldT;
    targetSlot.holdDurationMs = Math.min(DEFAULT_ESCALATE_HOLD_MS, MAX_ESCALATE_HOLD_MS);
    targetSlot.holdElapsedMs = 0;
    targetSlot.scale = 1.0;
    targetSlot.burstVelocities = undefined;

    return targetSlot;
  }

  /**
   * Advances simulation by deltaMs milliseconds.
   */
  public update(deltaMs: number): void {
    for (const slot of this.slots) {
      if (!slot.active) continue;

      slot.elapsedMs += deltaMs;

      if (slot.outcome === "deny") {
        this.updateDenyParticle(slot, deltaMs);
      } else if (slot.outcome === "escalate") {
        this.updateEscalateParticle(slot, deltaMs);
      } else if (slot.outcome === "redact") {
        this.updateRedactParticle(slot, deltaMs);
      } else {
        // allow
        this.updateAllowParticle(slot, deltaMs);
      }
    }
  }

  private updateAllowParticle(slot: ParticleSlot, _deltaMs: number): void {
    const progress = Math.min(1.0, slot.elapsedMs / slot.durationMs);
    slot.t = progress;
    slot.currentPos = evaluateBezier(slot.p0, slot.pCtrl, slot.p1, slot.t);
    slot.phase = slot.t < slot.shieldT ? "inbound" : "outbound";
    slot.scale = 1.0;

    if (progress >= 1.0) {
      this.deactivateSlot(slot);
    }
  }

  private updateDenyParticle(slot: ParticleSlot, _deltaMs: number): void {
    if (slot.phase === "inbound") {
      const travelDuration = slot.durationMs * slot.shieldT;
      const progress = Math.min(1.0, slot.elapsedMs / travelDuration);
      slot.t = progress * slot.shieldT;
      slot.currentPos = evaluateBezier(slot.p0, slot.pCtrl, slot.p1, slot.t);

      if (progress >= 1.0) {
        // Arrived at shield: trigger burst! Never advances past shieldT.
        slot.phase = "burst";
        slot.scale = 1.4;
        // Generate radial burst velocities
        slot.burstVelocities = Array.from({ length: 8 }, (_, i) => {
          const angle = (2 * Math.PI * i) / 8;
          return [
            Math.cos(angle) * 1.5,
            (Math.sin(angle * 2) * 0.8),
            Math.sin(angle) * 1.5,
          ];
        });
      }
    } else if (slot.phase === "burst") {
      // Burst expansion and fade
      const burstDuration = 600; // ms
      const burstElapsed = slot.elapsedMs - slot.durationMs * slot.shieldT;
      if (burstElapsed >= burstDuration) {
        this.deactivateSlot(slot);
      } else {
        const factor = 1 - burstElapsed / burstDuration;
        slot.scale = 1.4 * factor;
      }
    }
  }

  private updateRedactParticle(slot: ParticleSlot, _deltaMs: number): void {
    const progress = Math.min(1.0, slot.elapsedMs / slot.durationMs);
    slot.t = progress;
    slot.currentPos = evaluateBezier(slot.p0, slot.pCtrl, slot.p1, slot.t);

    // Pulse amber around shield penetration
    const nearShield = Math.abs(slot.t - slot.shieldT) < 0.12;
    if (nearShield) {
      slot.phase = "holding"; // amber pulse
      slot.scale = 1.5;
    } else {
      slot.phase = slot.t < slot.shieldT ? "inbound" : "outbound";
      slot.scale = 1.1; // diamond/altered shape scale
    }

    if (progress >= 1.0) {
      this.deactivateSlot(slot);
    }
  }

  private updateEscalateParticle(slot: ParticleSlot, deltaMs: number): void {
    if (slot.phase === "inbound") {
      const travelDuration = slot.durationMs * slot.shieldT;
      const progress = Math.min(1.0, slot.elapsedMs / travelDuration);
      slot.t = progress * slot.shieldT;
      slot.currentPos = evaluateBezier(slot.p0, slot.pCtrl, slot.p1, slot.t);

      if (progress >= 1.0) {
        slot.phase = "holding";
        slot.currentPos = evaluateBezier(slot.p0, slot.pCtrl, slot.p1, slot.shieldT);
      }
    } else if (slot.phase === "holding") {
      slot.holdElapsedMs += deltaMs;
      // Pulsate scale between 1.0 and 1.6 with 1s frequency
      const pulse = Math.sin((slot.holdElapsedMs / 1000) * Math.PI * 2);
      slot.scale = 1.3 + pulse * 0.3;

      // Check timeout (capped at max 10s)
      const maxHold = Math.min(slot.holdDurationMs, MAX_ESCALATE_HOLD_MS);
      if (slot.holdElapsedMs >= maxHold) {
        this.deactivateSlot(slot);
      }
    }
  }

  public deactivateSlot(slot: ParticleSlot): void {
    slot.active = false;
    slot.phase = "expired";
    slot.t = 0;
    slot.scale = 0;
    slot.burstVelocities = undefined;
  }

  private findOldestByOutcome(outcome: DecisionOutcome): ParticleSlot | null {
    let oldest: ParticleSlot | null = null;
    let minBirth = Infinity;

    for (const slot of this.slots) {
      if (slot.active && slot.outcome === outcome) {
        if (slot.birthTime < minBirth) {
          minBirth = slot.birthTime;
          oldest = slot;
        }
      }
    }

    return oldest;
  }
}
