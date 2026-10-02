import { describe, it, expect, beforeEach } from "vitest";
import * as THREE from "three";
import { useGraphStore } from "../stores/useGraphStore";
import { computeGraphLayout } from "../utils/layout";
import {
  ParticlePoolManager,
  OUTCOME_VISUAL_MAP,
} from "../utils/particleMath";
import type { DecisionEvent, GraphSnapshot } from "../types/graph";

describe("Particle Effects End-to-End Render-State Integration", () => {
  beforeEach(() => {
    useGraphStore.getState().clear();
  });

  it("proves a deny event produces a visible particle in the pool render buffer with a nonzero instance count", () => {
    // 1. Setup baseline snapshot with canonical agents and tools
    const snapshot: GraphSnapshot = {
      latest_audit_seq: 10,
      agents: [
        {
          id: "agent-uuid-001",
          name: "Support-Bot",
          role: "support",
          owner: "Support Team",
          status: "active",
        },
      ],
      tools: [
        {
          id: "tool-uuid-001",
          name: "crm.read_ticket",
          server: "crm-server",
          sensitivity: "normal",
        },
      ],
      grants: [{ agent_id: "agent-uuid-001", tool_id: "tool-uuid-001" }],
      recent_decisions: [],
    };

    useGraphStore.getState().applySnapshot(snapshot);

    // 2. Compute 3D layout (proves dual indexing by UUID and logical name)
    const { agentPositions, toolPositions } = computeGraphLayout(
      Array.from(useGraphStore.getState().agents.values()),
      Array.from(useGraphStore.getState().tools.values()),
    );

    expect(agentPositions.has("agent-uuid-001")).toBe(true);
    expect(toolPositions.has("tool-uuid-001")).toBe(true);

    // 3. Initialize ParticlePoolManager (capacity 500)
    const poolManager = new ParticlePoolManager(500);
    expect(poolManager.getActiveCount()).toBe(0);

    // Set up live event listener (mirroring ParticlePool.tsx behavior)
    let liveEventReceived: DecisionEvent | null = null;
    const handleLiveEvent = (event: DecisionEvent) => {
      liveEventReceived = event;
      // 1. Resolve agent position: try direct agent_id, then agent name match
      let p0 = agentPositions.get(event.agent_id);
      if (!p0) {
        const agents = useGraphStore.getState().agents;
        for (const [id, a] of agents.entries()) {
          if (a.name === event.agent_id || (event.agent_name && a.name === event.agent_name)) {
            p0 = agentPositions.get(id);
            break;
          }
        }
      }

      // 2. Resolve tool position: try direct tool_id, then tool name match
      let p1 = toolPositions.get(event.tool_id);
      if (!p1) {
        const tools = useGraphStore.getState().tools;
        for (const [id, t] of tools.entries()) {
          if (t.name === event.tool_id) {
            p1 = toolPositions.get(id);
            break;
          }
        }
      }

      if (!p0 || !p1) return;
      poolManager.spawn(p0, p1, event.outcome, 1000, 1200);
    };

    useGraphStore.getState().setLiveEventListener(handleLiveEvent);

    // 4. Dispatch a DENY event (using logical tool name as gateway pipeline does)
    const denyEvent: DecisionEvent = {
      decision_id: "dec-deny-001",
      action_id: "act-deny-001",
      agent_id: "agent-uuid-001",
      agent_name: "Support-Bot",
      tool_id: "crm.read_ticket", // logical tool name from req.tool
      outcome: "deny",
      rule_id: "R4-deny-untrusted-instruction",
      risk_score: 0.95,
      session_id: "sess-001",
      parent_action_id: null,
      audit_seq: 11,
      data_classes: [],
      latency_ms: 10.5,
    };

    const applied = useGraphStore.getState().applyEvent(denyEvent);
    expect(applied).toBe(true);
    expect(liveEventReceived).not.toBeNull();
    const receivedEvent = liveEventReceived as unknown as DecisionEvent;
    expect(receivedEvent.outcome).toBe("deny");

    // 5. Assert: Active particle count in pool manager is nonzero!
    expect(poolManager.getActiveCount()).toBe(1);

    const slot = poolManager.getSlot(0);
    expect(slot.active).toBe(true);
    expect(slot.outcome).toBe("deny");
    expect(slot.phase).toBe("inbound");

    // 6. Simulate frame updates in useFrame and verify InstancedMesh buffer writes
    const instancedMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.09, 1),
      new THREE.MeshStandardMaterial(),
      500,
    );
    const tempMatrix = new THREE.Matrix4();
    const tempObj = new THREE.Object3D();

    // Step a: advance 100ms (inbound motion)
    poolManager.update(100);
    expect(slot.phase).toBe("inbound");
    expect(slot.t).toBeGreaterThan(0);

    // Write to instance matrix buffer
    tempObj.position.set(slot.currentPos[0], slot.currentPos[1], slot.currentPos[2]);
    tempObj.scale.set(slot.scale, slot.scale, slot.scale);
    tempObj.updateMatrix();
    instancedMesh.setMatrixAt(0, tempObj.matrix);

    instancedMesh.getMatrixAt(0, tempMatrix);
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    tempMatrix.decompose(position, rotation, scale);

    // Verify non-zero visible scale in render buffer
    expect(scale.x).toBeGreaterThan(0.5);
    expect(scale.y).toBeGreaterThan(0.5);
    expect(scale.z).toBeGreaterThan(0.5);

    // Step b: advance to shield intersection (t >= shieldT) to trigger deny shield burst
    // Duration is 1200ms, shieldT is ~0.45, so at ~600ms particle hits shield and enters burst
    poolManager.update(600);
    expect(slot.phase).toBe("burst");
    expect(slot.burstVelocities).toBeDefined();
    expect(slot.burstVelocities!.length).toBe(8); // 8 octant outward explosion shards
    expect(OUTCOME_VISUAL_MAP.deny.colorHex).toBe("#F43F5E");
  });

  it("verifies escalate event holds at shield and sets pending approval badge on agent", () => {
    const snapshot: GraphSnapshot = {
      latest_audit_seq: 10,
      agents: [
        {
          id: "agent-uuid-002",
          name: "Finance-Agent",
          role: "finance",
          owner: "Finance Team",
          status: "active",
        },
      ],
      tools: [
        {
          id: "tool-uuid-002",
          name: "crm.export",
          server: "crm-server",
          sensitivity: "high",
        },
      ],
      grants: [{ agent_id: "agent-uuid-002", tool_id: "tool-uuid-002" }],
      recent_decisions: [],
    };

    useGraphStore.getState().applySnapshot(snapshot);

    const poolManager = new ParticlePoolManager(500);
    useGraphStore.getState().setLiveEventListener((event) => {
      poolManager.spawn([5, 0, 0], [14, 0, 0], event.outcome, 1000, 1200);
    });

    const escalateEvent: DecisionEvent = {
      decision_id: "dec-esc-001",
      action_id: "act-esc-001",
      agent_id: "agent-uuid-002",
      agent_name: "Finance-Agent",
      tool_id: "crm.export",
      outcome: "escalate",
      rule_id: "R3-escalate-bulk-export",
      risk_score: 0.85,
      session_id: "sess-002",
      parent_action_id: null,
      audit_seq: 12,
      data_classes: [],
      latency_ms: 12.0,
    };

    useGraphStore.getState().applyEvent(escalateEvent);

    // Verify particle is spawned
    expect(poolManager.getActiveCount()).toBe(1);
    const slot = poolManager.getSlot(0);
    expect(slot.outcome).toBe("escalate");

    // Advance to shield arrival: enters holding phase
    poolManager.update(700);
    expect(slot.phase).toBe("holding");

    // Verify pending approval badge on agent persists in store
    const agent = useGraphStore.getState().agents.get("agent-uuid-002");
    expect(agent?.pendingEscalations).toBe(1);

    // Verify clearEscalations resets badge count
    useGraphStore.getState().clearEscalations();
    const clearedAgent = useGraphStore.getState().agents.get("agent-uuid-002");
    expect(clearedAgent?.pendingEscalations).toBe(0);
  });
});
