import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useGraphStore } from "../../stores/useGraphStore";

interface GrantEdgesMeshProps {
  agentPositions: Map<string, [number, number, number]>;
  toolPositions: Map<string, [number, number, number]>;
}

const tempObject = new THREE.Object3D();
const tempColor = new THREE.Color();
const yAxis = new THREE.Vector3(0, 1, 0);

const highlightColor = new THREE.Color("#38BDF8"); // Vibrant cyan
const defaultDimColor = new THREE.Color("#334155"); // Subtle dark slate
const fadedColor = new THREE.Color("#0F172A"); // Faded out when other node is selected

export function GrantEdgesMesh({
  agentPositions,
  toolPositions,
}: GrantEdgesMeshProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const grants = useGraphStore((s) => s.grants);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const hoveredNodeId = useGraphStore((s) => s.hoveredNodeId);

  // Filter valid grants that have known positions
  const validGrants = useMemo(() => {
    return grants.filter(
      (g) => agentPositions.has(g.agent_id) && toolPositions.has(g.tool_id),
    );
  }, [grants, agentPositions, toolPositions]);

  const count = validGrants.length;

  // Thin, delicate geometry for uncluttered constellation aesthetic
  const cylGeo = useMemo(() => new THREE.CylinderGeometry(0.006, 0.006, 1, 5), []);
  const edgeMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#FFFFFF",
        transparent: true,
        opacity: 0.65,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      cylGeo.dispose();
      edgeMat.dispose();
    };
  }, [cylGeo, edgeMat]);

  useEffect(() => {
    if (!meshRef.current || count === 0) return;

    const pStart = new THREE.Vector3();
    const pEnd = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const quat = new THREE.Quaternion();

    const hasFocus = Boolean(selectedNodeId || hoveredNodeId);

    for (let i = 0; i < count; i++) {
      const g = validGrants[i]!;
      const aPos = agentPositions.get(g.agent_id)!;
      const tPos = toolPositions.get(g.tool_id)!;

      pStart.set(aPos[0], aPos[1], aPos[2]);
      pEnd.set(tPos[0], tPos[1], tPos[2]);

      const length = pStart.distanceTo(pEnd);
      const mid = pStart.clone().add(pEnd).multiplyScalar(0.5);

      dir.subVectors(pEnd, pStart).normalize();
      quat.setFromUnitVectors(yAxis, dir);

      const isHighlighted =
        (selectedNodeId && (g.agent_id === selectedNodeId || g.tool_id === selectedNodeId)) ||
        (hoveredNodeId && (g.agent_id === hoveredNodeId || g.tool_id === hoveredNodeId));

      let thicknessScale = 1.0;
      if (isHighlighted) {
        thicknessScale = 3.2;
        tempColor.copy(highlightColor);
      } else if (hasFocus) {
        thicknessScale = 0.6;
        tempColor.copy(fadedColor);
      } else {
        thicknessScale = 1.0;
        tempColor.copy(defaultDimColor);
      }

      tempObject.position.copy(mid);
      tempObject.quaternion.copy(quat);
      tempObject.scale.set(thicknessScale, length, thicknessScale);
      tempObject.updateMatrix();

      meshRef.current.setMatrixAt(i, tempObject.matrix);
      meshRef.current.setColorAt(i, tempColor);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [validGrants, agentPositions, toolPositions, count, selectedNodeId, hoveredNodeId]);

  if (count === 0) return null;

  return <instancedMesh ref={meshRef} args={[cylGeo, edgeMat, count]} />;
}
