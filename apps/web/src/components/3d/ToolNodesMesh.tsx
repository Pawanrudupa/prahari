import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import { useGraphStore } from "../../stores/useGraphStore";

interface ToolNodesMeshProps {
  toolPositions: Map<string, [number, number, number]>;
}

const tempObject = new THREE.Object3D();
const tempColor = new THREE.Color();
const normalColor = new THREE.Color("#94A3B8"); // Slate tool default
const highSensColor = new THREE.Color("#F59E0B"); // Amber high sensitivity
const hoveredColor = new THREE.Color("#E2E8F0"); // Bright hover
const selectedColor = new THREE.Color("#38BDF8"); // Selected bright cyan

export function ToolNodesMesh({ toolPositions }: ToolNodesMeshProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const tools = useGraphStore((s) => s.tools);
  const hoveredNodeId = useGraphStore((s) => s.hoveredNodeId);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const selectNode = useGraphStore((s) => s.selectNode);
  const hoverNode = useGraphStore((s) => s.hoverNode);

  const toolList = useMemo(() => Array.from(tools.values()), [tools]);
  const toolIds = useMemo(() => toolList.map((t) => t.id), [toolList]);
  const count = toolList.length;

  // Octahedron geometry for tools
  const octaGeo = useMemo(() => new THREE.OctahedronGeometry(0.38, 0), []);
  const octaMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        roughness: 0.25,
        metalness: 0.35,
        emissive: "#0F172A",
        emissiveIntensity: 0.2,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      octaGeo.dispose();
      octaMat.dispose();
    };
  }, [octaGeo, octaMat]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const time = clock.getElapsedTime();

    for (let i = 0; i < count; i++) {
      const tool = toolList[i]!;
      const pos = toolPositions.get(tool.id) || [0, 0, 0];
      const isHovered = hoveredNodeId === tool.id;
      const isSelected = selectedNodeId === tool.id;

      const targetScale = isHovered ? 1.4 : isSelected ? 1.25 : 1.0;

      tempObject.position.set(pos[0], pos[1], pos[2]);
      tempObject.scale.set(targetScale, targetScale, targetScale);
      tempObject.rotation.set(time * 0.4 + i, time * 0.6 + i, 0);
      tempObject.updateMatrix();
      meshRef.current.setMatrixAt(i, tempObject.matrix);

      if (isSelected) {
        tempColor.copy(selectedColor);
      } else if (isHovered) {
        tempColor.copy(hoveredColor);
      } else if (tool.sensitivity === "high" || tool.sensitivity === "critical") {
        tempColor.copy(highSensColor);
      } else {
        tempColor.copy(normalColor);
      }
      meshRef.current.setColorAt(i, tempColor);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  if (count === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[octaGeo, octaMat, count]}
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined && e.instanceId < toolIds.length) {
            selectNode(toolIds[e.instanceId]!);
          }
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined && e.instanceId < toolIds.length) {
            hoverNode(toolIds[e.instanceId]!);
            document.body.style.cursor = "pointer";
          }
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          hoverNode(null);
          document.body.style.cursor = "auto";
        }}
      />

      {/* SDF Billboard Labels above tool nodes */}
      {toolList.map((tool) => {
        const pos = toolPositions.get(tool.id);
        if (!pos) return null;
        const isSelected = selectedNodeId === tool.id;
        const isHovered = hoveredNodeId === tool.id;
        return (
          <group key={tool.id} position={[pos[0], pos[1] + 0.75, pos[2]]}>
            <Billboard>
              <Text
                fontSize={0.24}
                color={isSelected ? "#38BDF8" : isHovered ? "#E2E8F0" : "#94A3B8"}
                anchorX="center"
                anchorY="bottom"
                outlineWidth={0.02}
                outlineColor="#020617"
              >
                {tool.name}
              </Text>
            </Billboard>
          </group>
        );
      })}
    </group>
  );
}
