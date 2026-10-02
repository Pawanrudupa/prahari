import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGraphStore } from "../../stores/useGraphStore";
import {
  MAX_PARTICLE_POOL_SIZE,
  OUTCOME_VISUAL_MAP,
  ParticlePoolManager,
} from "../../utils/particleMath";
import type { DecisionEvent } from "../../types/graph";

interface ParticlePoolProps {
  agentPositions: Map<string, [number, number, number]>;
  toolPositions: Map<string, [number, number, number]>;
  isDegraded?: boolean;
  reducedMotion?: boolean;
}

const tempObject = new THREE.Object3D();
const tempColor = new THREE.Color();

export function ParticlePool({
  agentPositions,
  toolPositions,
  isDegraded = false,
  reducedMotion = false,
}: ParticlePoolProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const burstMeshRef = useRef<THREE.InstancedMesh>(null);

  // Pool capacity: 100 if degraded, 500 normal
  const capacity = isDegraded ? 100 : MAX_PARTICLE_POOL_SIZE;
  const poolManager = useMemo(() => new ParticlePoolManager(capacity), [capacity]);

  // Max 64 active burst shards for deny explosions
  const maxBurstShards = 64;

  // Geometries and materials
  const particleGeo = useMemo(() => new THREE.IcosahedronGeometry(0.09, 1), []);
  const particleMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        roughness: 0.15,
        metalness: 0.8,
        emissiveIntensity: 0.8,
      }),
    [],
  );

  const burstGeo = useMemo(() => new THREE.TetrahedronGeometry(0.06, 0), []);
  const burstMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: OUTCOME_VISUAL_MAP.deny.colorHex,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      particleGeo.dispose();
      particleMat.dispose();
      burstGeo.dispose();
      burstMat.dispose();
    };
  }, [particleGeo, particleMat, burstGeo, burstMat]);

  // Subscribe to LIVE stream events ONLY (never snapshot replay)
  useEffect(() => {
    const handleLiveEvent = (event: DecisionEvent) => {
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

      if (reducedMotion) {
        // Reduced motion: spawn with ultra-short duration
        poolManager.spawn(p0, p1, event.outcome, Date.now(), 50);
      } else {
        poolManager.spawn(p0, p1, event.outcome, Date.now(), 1200);
      }
    };

    useGraphStore.getState().setLiveEventListener(handleLiveEvent);

    return () => {
      useGraphStore.getState().setLiveEventListener(null);
    };
  }, [agentPositions, toolPositions, poolManager, reducedMotion]);

  // Update loop: ZERO React state per frame, strictly refs
  useFrame((_, delta) => {
    const deltaMs = Math.min(delta * 1000, 100); // clamp delta
    poolManager.update(deltaMs);

    if (!meshRef.current) return;

    let burstShardIndex = 0;

    for (let i = 0; i < capacity; i++) {
      const slot = poolManager.getSlot(i);

      if (slot.active && slot.phase !== "expired") {
        tempObject.position.set(
          slot.currentPos[0],
          slot.currentPos[1],
          slot.currentPos[2],
        );
        tempObject.scale.set(slot.scale, slot.scale, slot.scale);

        // Rotation according to outcome
        if (slot.outcome === "redact") {
          tempObject.rotation.set(0.78, 0.78, 0); // diamond rotation
        } else {
          tempObject.rotation.set(0, 0, 0);
        }

        tempObject.updateMatrix();
        meshRef.current.setMatrixAt(i, tempObject.matrix);

        // Color based on outcome and phase
        const visual = OUTCOME_VISUAL_MAP[slot.outcome];
        if (slot.outcome === "redact" && slot.phase === "holding") {
          tempColor.setHex(0xFFD700); // high-intensity amber gold pulse
        } else {
          tempColor.set(visual.colorHex);
        }
        meshRef.current.setColorAt(i, tempColor);

        // Populate burst shards if in deny burst phase
        if (
          slot.outcome === "deny" &&
          slot.phase === "burst" &&
          slot.burstVelocities &&
          burstMeshRef.current
        ) {
          const burstProgress =
            (slot.elapsedMs - slot.durationMs * slot.shieldT) / 600;

          for (
            let s = 0;
            s < slot.burstVelocities.length && burstShardIndex < maxBurstShards;
            s++
          ) {
            const vel = slot.burstVelocities[s]!;
            const dist = burstProgress * 1.2;
            tempObject.position.set(
              slot.currentPos[0] + vel[0] * dist,
              slot.currentPos[1] + vel[1] * dist,
              slot.currentPos[2] + vel[2] * dist,
            );
            const shardScale = Math.max(0, 1 - burstProgress);
            tempObject.scale.set(shardScale, shardScale, shardScale);
            tempObject.rotation.set(dist * 5, dist * 5, 0);
            tempObject.updateMatrix();
            burstMeshRef.current.setMatrixAt(burstShardIndex++, tempObject.matrix);
          }
        }
      } else {
        // Inactive slot: hide off-screen
        tempObject.position.set(0, -999, 0);
        tempObject.scale.set(0, 0, 0);
        tempObject.updateMatrix();
        meshRef.current.setMatrixAt(i, tempObject.matrix);
      }
    }

    // Hide remaining burst shards
    if (burstMeshRef.current) {
      while (burstShardIndex < maxBurstShards) {
        tempObject.position.set(0, -999, 0);
        tempObject.scale.set(0, 0, 0);
        tempObject.updateMatrix();
        burstMeshRef.current.setMatrixAt(burstShardIndex++, tempObject.matrix);
      }
      burstMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* Primary Particle Pool */}
      <instancedMesh
        ref={meshRef}
        args={[particleGeo, particleMat, capacity]}
      />
      {/* Deny Burst Explosion Shards */}
      <instancedMesh
        ref={burstMeshRef}
        args={[burstGeo, burstMat, maxBurstShards]}
      />
    </group>
  );
}
