import { useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { PIPELINE_GATES, PipelineGate } from "./AgentJourneyData";

interface AgentJourney3DSceneProps {
  selectedGate: PipelineGate;
  onSelectGate: (gate: PipelineGate) => void;
  attackActive: boolean;
  onAttackFinish: () => void;
}

function GateMesh({
  gate,
  isSelected,
  onSelect,
}: {
  gate: PipelineGate;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const meshRef = useRef<THREE.Group>(null);
  const isDemo = gate.status === "Demo Detector";
  const isPlanned = gate.status === "Planned (Heuristic)";

  const color = isSelected
    ? "#38BDF8"
    : isDemo
      ? "#FBBF24"
      : isPlanned
        ? "#A78BFA"
        : "#2DD4A7";

  return (
    <group
      ref={meshRef}
      position={[gate.positionX, 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "auto")}
    >
      {/* Outer Gate Frame */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.6, 3.2, 0.4]} />
        <meshStandardMaterial
          color={color}
          wireframe
          transparent
          opacity={isSelected ? 0.9 : 0.4}
        />
      </mesh>

      {/* Inner Glowing Core */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.2, 2.8, 0.2]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isSelected ? 0.35 : 0.12}
        />
      </mesh>

      {/* Gate Top Label */}
      <Text
        position={[0, 2.1, 0]}
        fontSize={0.42}
        color={isSelected ? "#38BDF8" : "#E2E8F0"}
        anchorX="center"
        anchorY="bottom"
      >
        {gate.shortLabel}
      </Text>

      {/* Gate Status Pill */}
      <Text
        position={[0, -2.1, 0]}
        fontSize={0.28}
        color={color}
        anchorX="center"
        anchorY="top"
      >
        {gate.status}
      </Text>
    </group>
  );
}

function JourneyRail() {
  return (
    <group position={[0, -1.6, 0]}>
      {/* Dual Neon Rail Beams */}
      <mesh position={[0, 0, 0.4]}>
        <boxGeometry args={[32, 0.08, 0.08]} />
        <meshBasicMaterial color="#38BDF8" transparent opacity={0.3} />
      </mesh>
      <mesh position={[0, 0, -0.4]}>
        <boxGeometry args={[32, 0.08, 0.08]} />
        <meshBasicMaterial color="#38BDF8" transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

function PacketSystem({
  attackActive,
  onAttackFinish,
}: {
  attackActive: boolean;
  onAttackFinish: () => void;
}) {
  const benignPacketRef = useRef<THREE.Mesh>(null);
  const attackPacketRef = useRef<THREE.Mesh>(null);
  const [shattered, setShattered] = useState(false);

  const attackTargetX = -6; // Gate 03 (Injection scan)

  useFrame((_, delta) => {
    // 1. Benign looping packet
    if (benignPacketRef.current) {
      benignPacketRef.current.position.x += delta * 7;
      if (benignPacketRef.current.position.x > 16) {
        benignPacketRef.current.position.x = -16;
      }
    }

    // 2. Attack packet logic
    if (attackActive && attackPacketRef.current) {
      if (!shattered) {
        attackPacketRef.current.position.x += delta * 12;
        if (attackPacketRef.current.position.x >= attackTargetX) {
          setShattered(true);
          setTimeout(() => {
            setShattered(false);
            onAttackFinish();
          }, 1500);
        }
      }
    }
  });

  return (
    <group>
      {/* Benign Tool Call Packet (Cyan / Emerald) */}
      <mesh ref={benignPacketRef} position={[-16, 0, 0]}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial
          color="#2DD4A7"
          emissive="#2DD4A7"
          emissiveIntensity={2}
        />
      </mesh>

      {/* Attack Injection Packet (Crimson Shatter) */}
      {attackActive && (
        <mesh
          ref={attackPacketRef}
          position={shattered ? [attackTargetX, 0, 0] : [-16, 0, 0]}
        >
          {shattered ? (
            <dodecahedronGeometry args={[0.7, 0]} />
          ) : (
            <sphereGeometry args={[0.38, 16, 16]} />
          )}
          <meshStandardMaterial
            color="#F43F5E"
            emissive="#F43F5E"
            emissiveIntensity={shattered ? 4 : 2}
            wireframe={shattered}
          />
        </mesh>
      )}
    </group>
  );
}

function CameraRig({ selectedGate }: { selectedGate: PipelineGate }) {
  const { camera } = useThree();

  useFrame(() => {
    // Smoothly interpolate camera target towards selected gate
    const targetX = selectedGate.positionX;
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.05);
  });

  return null;
}

export function AgentJourney3DScene({
  selectedGate,
  onSelectGate,
  attackActive,
  onAttackFinish,
}: AgentJourney3DSceneProps) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 15]} intensity={1.2} />
      <pointLight position={[0, 5, 5]} intensity={0.8} color="#38BDF8" />

      <CameraRig selectedGate={selectedGate} />
      <JourneyRail />

      {PIPELINE_GATES.map((gate) => (
        <GateMesh
          key={gate.id}
          gate={gate}
          isSelected={gate.id === selectedGate.id}
          onSelect={() => onSelectGate(gate)}
        />
      ))}

      <PacketSystem
        attackActive={attackActive}
        onAttackFinish={onAttackFinish}
      />

      <OrbitControls
        enableRotate={true}
        enableZoom={true}
        enablePan={true}
        minDistance={6}
        maxDistance={25}
        maxPolarAngle={Math.PI / 2 + 0.1}
      />
    </>
  );
}
