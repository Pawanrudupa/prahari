import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useGraphStore } from "../../stores/useGraphStore";

interface GrantEdgesMeshProps {
  agentPositions: Map<string, [number, number, number]>;
  toolPositions: Map<string, [number, number, number]>;
}

const tempObject = new THREE.Object3D();
const yAxis = new THREE.Vector3(0, 1, 0);

export function GrantEdgesMesh({
  agentPositions,
  toolPositions,
}: GrantEdgesMeshProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const grants = useGraphStore((s) => s.grants);

  // Filter valid grants that have known positions
  const validGrants = useMemo(() => {
    return grants.filter(
      (g) => agentPositions.has(g.agent_id) && toolPositions.has(g.tool_id),
    );
  }, [grants, agentPositions, toolPositions]);

  const count = validGrants.length;

  const cylGeo = useMemo(() => new THREE.CylinderGeometry(0.012, 0.012, 1, 6), []);
  const edgeMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#38BDF8",
        transparent: true,
        opacity: 0.2,
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
    if (!meshRef.current) return;

    const pStart = new THREE.Vector3();
    const pEnd = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const quat = new THREE.Quaternion();

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

      tempObject.position.copy(mid);
      tempObject.quaternion.copy(quat);
      tempObject.scale.set(1, length, 1);
      tempObject.updateMatrix();

      meshRef.current.setMatrixAt(i, tempObject.matrix);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [validGrants, agentPositions, toolPositions, count]);

  if (count === 0) return null;

  return <instancedMesh ref={meshRef} args={[cylGeo, edgeMat, count]} />;
}
