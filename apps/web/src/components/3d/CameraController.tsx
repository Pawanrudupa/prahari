import { useRef, useEffect, useMemo, type ComponentRef } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useGraphStore } from "../../stores/useGraphStore";

interface CameraControllerProps {
  agentPositions: Map<string, [number, number, number]>;
  toolPositions: Map<string, [number, number, number]>;
  reducedMotion?: boolean;
}

function computeOverviewCameraPos(
  agentPositions: Map<string, [number, number, number]>,
  toolPositions: Map<string, [number, number, number]>,
): THREE.Vector3 {
  let maxR = 16.5;
  for (const pos of agentPositions.values()) {
    const r = Math.hypot(pos[0], pos[1], pos[2]);
    if (r > maxR) maxR = r;
  }
  for (const pos of toolPositions.values()) {
    const r = Math.hypot(pos[0], pos[1], pos[2]);
    if (r > maxR) maxR = r;
  }

  // Margin factor so all nodes fit comfortably inside FOV
  const dist = Math.max(26, maxR * 1.55);
  return new THREE.Vector3(0, Number((dist * 0.45).toFixed(2)), Number((dist * 0.88).toFixed(2)));
}

const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0);

export function CameraController({
  agentPositions,
  toolPositions,
  reducedMotion = false,
}: CameraControllerProps) {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, gl } = useThree();

  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const selectNode = useGraphStore((s) => s.selectNode);

  // Compute overview pos based on layout
  const overviewPos = useMemo(
    () => computeOverviewCameraPos(agentPositions, toolPositions),
    [agentPositions, toolPositions],
  );

  // Desired target & camera position refs
  const targetFocus = useRef<THREE.Vector3>(DEFAULT_TARGET.clone());
  const cameraFocus = useRef<THREE.Vector3>(overviewPos.clone());
  const isTransitioning = useRef<boolean>(true);

  // Auto-frame initial camera on mount
  useEffect(() => {
    if (!selectedNodeId) {
      targetFocus.current.copy(DEFAULT_TARGET);
      cameraFocus.current.copy(overviewPos);
      isTransitioning.current = true;
    }
  }, [overviewPos, selectedNodeId]);

  // Update desired focus when selectedNodeId changes
  useEffect(() => {
    if (!selectedNodeId) {
      targetFocus.current.copy(DEFAULT_TARGET);
      cameraFocus.current.copy(overviewPos);
      isTransitioning.current = true;
      return;
    }

    const pos =
      agentPositions.get(selectedNodeId) || toolPositions.get(selectedNodeId);

    if (pos) {
      targetFocus.current.set(pos[0], pos[1], pos[2]);
      // Position camera slightly elevated and pushed back from the node
      const dir = new THREE.Vector3(pos[0], pos[1], pos[2]).normalize();
      if (dir.lengthSq() < 0.001) dir.set(0, 0, 1);
      cameraFocus.current.set(
        pos[0] + dir.x * 4,
        pos[1] + 2.5,
        pos[2] + dir.z * 4,
      );
      isTransitioning.current = true;
    }
  }, [selectedNodeId, agentPositions, toolPositions, overviewPos]);

  // Double click canvas background to reset camera
  useEffect(() => {
    const handleDblClick = () => {
      selectNode(null);
    };

    const domElement = gl.domElement;
    domElement.addEventListener("dblclick", handleDblClick);
    return () => {
      domElement.removeEventListener("dblclick", handleDblClick);
    };
  }, [gl, selectNode]);

  // Smooth lerp damping in useFrame
  useFrame(() => {
    if (!controlsRef.current) return;

    if (isTransitioning.current) {
      if (reducedMotion) {
        // Instant teleport for reduced motion
        controlsRef.current.target.copy(targetFocus.current);
        camera.position.copy(cameraFocus.current);
        isTransitioning.current = false;
      } else {
        // Smooth lerp
        controlsRef.current.target.lerp(targetFocus.current, 0.08);
        camera.position.lerp(cameraFocus.current, 0.08);

        const targetDist = controlsRef.current.target.distanceTo(targetFocus.current);
        const camDist = camera.position.distanceTo(cameraFocus.current);

        if (targetDist < 0.02 && camDist < 0.02) {
          controlsRef.current.target.copy(targetFocus.current);
          camera.position.copy(cameraFocus.current);
          isTransitioning.current = false;
        }
      }
      controlsRef.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.05}
      maxDistance={85}
      minDistance={4}
      maxPolarAngle={Math.PI / 2 + 0.1} // Prevent looking completely from below ground
    />
  );
}
