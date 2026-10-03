import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import { useGraphStore } from "../../stores/useGraphStore";
import { OUTCOME_VISUAL_MAP } from "../../utils/particleMath";

interface AgentNodesMeshProps {
  agentPositions: Map<string, [number, number, number]>;
}

const tempObject = new THREE.Object3D();
const tempColor = new THREE.Color();
const baseColor = new THREE.Color("#60A5FA"); // Blue agent base
const hoveredColor = new THREE.Color("#93C5FD"); // Highlight
const selectedColor = new THREE.Color("#38BDF8"); // Selected bright cyan
const escalateColor = new THREE.Color(OUTCOME_VISUAL_MAP.escalate.colorHex); // Violet badge

export function AgentNodesMesh({ agentPositions }: AgentNodesMeshProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const badgeMeshRef = useRef<THREE.InstancedMesh>(null);

  const agents = useGraphStore((s) => s.agents);
  const hoveredNodeId = useGraphStore((s) => s.hoveredNodeId);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const selectNode = useGraphStore((s) => s.selectNode);
  const hoverNode = useGraphStore((s) => s.hoverNode);

  const agentList = useMemo(() => Array.from(agents.values()), [agents]);
  const agentIds = useMemo(() => agentList.map((a) => a.id), [agentList]);
  const count = agentList.length;

  // Geometry & Material references for clean unmount disposal
  const sphereGeo = useMemo(() => new THREE.SphereGeometry(0.48, 24, 24), []);
  const sphereMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        roughness: 0.2,
        metalness: 0.3,
        emissive: "#1E3A8A",
        emissiveIntensity: 0.4,
      }),
    [],
  );

  const badgeGeo = useMemo(() => new THREE.TorusGeometry(0.62, 0.05, 12, 32), []);
  const badgeMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: escalateColor,
        transparent: true,
        opacity: 0.85,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      sphereGeo.dispose();
      sphereMat.dispose();
      badgeGeo.dispose();
      badgeMat.dispose();
    };
  }, [sphereGeo, sphereMat, badgeGeo, badgeMat]);

  // Update instance matrices and colors in useFrame
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const time = clock.getElapsedTime();

    for (let i = 0; i < count; i++) {
      const agent = agentList[i]!;
      const pos = agentPositions.get(agent.id) || [0, 0, 0];
      const isHovered = hoveredNodeId === agent.id;
      const isSelected = selectedNodeId === agent.id;

      // Activity scaling + hover bounce
      const activityScale = 1.0 + Math.min(0.5, (agent.activityCount || 0) * 0.05);
      const targetScale = activityScale * (isHovered ? 1.25 : isSelected ? 1.15 : 1.0);

      tempObject.position.set(pos[0], pos[1], pos[2]);
      tempObject.scale.set(targetScale, targetScale, targetScale);
      tempObject.rotation.set(0, 0, 0);
      tempObject.updateMatrix();
      meshRef.current.setMatrixAt(i, tempObject.matrix);

      // Color tinting
      if (isSelected) {
        tempColor.copy(selectedColor);
      } else if (isHovered) {
        tempColor.copy(hoveredColor);
      } else if (agent.riskScore && agent.riskScore > 0.6) {
        tempColor.setHSL(0.05, 0.9, 0.55); // Amber/Red high risk tint
      } else {
        tempColor.copy(baseColor);
      }
      meshRef.current.setColorAt(i, tempColor);

      // Pending Approval Badge (violet halo)
      if (badgeMeshRef.current) {
        const hasPending = (agent.pendingEscalations || 0) > 0;
        if (hasPending) {
          const pulse = 1.0 + 0.15 * Math.sin(time * 4 + i);
          tempObject.position.set(pos[0], pos[1] + 0.1, pos[2]);
          tempObject.scale.set(pulse, pulse, pulse);
          tempObject.rotation.set(Math.PI / 2, time * 1.5, 0);
          tempObject.updateMatrix();
          badgeMeshRef.current.setMatrixAt(i, tempObject.matrix);
        } else {
          // Hide badge off-screen
          tempObject.position.set(0, -999, 0);
          tempObject.scale.set(0, 0, 0);
          tempObject.updateMatrix();
          badgeMeshRef.current.setMatrixAt(i, tempObject.matrix);
        }
      }
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
    if (badgeMeshRef.current) {
      badgeMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  if (count === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[sphereGeo, sphereMat, count]}
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined && e.instanceId < agentIds.length) {
            selectNode(agentIds[e.instanceId]!);
          }
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined && e.instanceId < agentIds.length) {
            hoverNode(agentIds[e.instanceId]!);
            document.body.style.cursor = "pointer";
          }
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          hoverNode(null);
          document.body.style.cursor = "auto";
        }}
      />

      {/* Pending Approval Badges */}
      <instancedMesh
        ref={badgeMeshRef}
        args={[badgeGeo, badgeMat, count]}
      />

      {/* SDF Billboard Labels above nodes */}
      {agentList.map((agent) => {
        const pos = agentPositions.get(agent.id);
        if (!pos) return null;
        const isSelected = selectedNodeId === agent.id;
        const isHovered = hoveredNodeId === agent.id;
        return (
          <group key={agent.id} position={[pos[0], pos[1] + 0.85, pos[2]]}>
            <Billboard>
              <Text
                fontSize={0.28}
                color={isSelected ? "#38BDF8" : isHovered ? "#93C5FD" : "#CBD5E1"}
                anchorX="center"
                anchorY="bottom"
                outlineWidth={0.02}
                outlineColor="#020617"
              >
                {agent.name}
              </Text>
            </Billboard>
          </group>
        );
      })}
    </group>
  );
}
