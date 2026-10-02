import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { SHIELD_RADIUS } from "../../utils/layout";

export function PolicyShield() {
  const meshRef = useRef<THREE.Mesh>(null);
  const wireRef = useRef<THREE.Mesh>(null);

  const sphereGeo = useMemo(
    () => new THREE.SphereGeometry(SHIELD_RADIUS, 36, 36),
    [],
  );

  const shieldMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#1E293B",
        emissive: "#0284C7",
        emissiveIntensity: 0.15,
        transparent: true,
        opacity: 0.15,
        roughness: 0.2,
        metalness: 0.8,
        wireframe: false,
      }),
    [],
  );

  const wireMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#38BDF8",
        wireframe: true,
        transparent: true,
        opacity: 0.12,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      sphereGeo.dispose();
      shieldMat.dispose();
      wireMat.dispose();
    };
  }, [sphereGeo, shieldMat, wireMat]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.05;
    }
    if (wireRef.current) {
      wireRef.current.rotation.y = -t * 0.08;
      wireRef.current.rotation.x = Math.sin(t * 0.1) * 0.05;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Translucent glass shell */}
      <mesh ref={meshRef} geometry={sphereGeo} material={shieldMat} />
      {/* Geodesic wireframe lattice */}
      <mesh ref={wireRef} geometry={sphereGeo} material={wireMat} />
    </group>
  );
}
