import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { SHIELD_RADIUS } from "../../utils/layout";

const fresnelVertexShader = `
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fresnelFragmentShader = `
uniform vec3 glowColor;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);
  float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 2.5);
  gl_FragColor = vec4(glowColor, fresnel * 0.45 + 0.05);
}
`;

export function PolicyShield() {
  const meshRef = useRef<THREE.Mesh>(null);
  const wireRef = useRef<THREE.Mesh>(null);
  const rimGlowRef = useRef<THREE.Mesh>(null);

  // Geodesic Icosahedron geometry
  const geodesicGeo = useMemo(
    () => new THREE.IcosahedronGeometry(SHIELD_RADIUS, 3),
    [],
  );

  const shieldMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#0F172A",
        emissive: "#0284C7",
        emissiveIntensity: 0.25,
        transparent: true,
        opacity: 0.18,
        roughness: 0.15,
        metalness: 0.85,
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
        opacity: 0.15,
      }),
    [],
  );

  const fresnelMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: fresnelVertexShader,
        fragmentShader: fresnelFragmentShader,
        uniforms: {
          glowColor: { value: new THREE.Color("#38BDF8") },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
        depthWrite: false,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      geodesicGeo.dispose();
      shieldMat.dispose();
      wireMat.dispose();
      fresnelMat.dispose();
    };
  }, [geodesicGeo, shieldMat, wireMat, fresnelMat]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.03;
    }
    if (wireRef.current) {
      wireRef.current.rotation.y = -t * 0.06;
      wireRef.current.rotation.x = Math.sin(t * 0.08) * 0.05;
    }
    if (rimGlowRef.current) {
      rimGlowRef.current.rotation.y = t * 0.03;
    }
  });

  return (
    <group>
      {/* 1. Core Translucent Shield Shell */}
      <mesh
        ref={meshRef}
        geometry={geodesicGeo}
        material={shieldMat}
      />

      {/* 2. Geodesic Wireframe Overlay */}
      <mesh
        ref={wireRef}
        geometry={geodesicGeo}
        material={wireMat}
      />

      {/* 3. Fresnel Rim Glow Shell */}
      <mesh
        ref={rimGlowRef}
        geometry={geodesicGeo}
        material={fresnelMat}
        scale={[1.008, 1.008, 1.008]}
      />
    </group>
  );
}
