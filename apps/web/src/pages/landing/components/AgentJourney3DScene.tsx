import { useRef, useState, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text, Billboard, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { PIPELINE_GATES, PipelineGate, OUTCOME_BRANCHES } from "./AgentJourneyData";

export type SimulationType = "idle" | "benign" | "pii" | "bulk_export" | "attack";

interface AgentJourney3DSceneProps {
  selectedGate: PipelineGate;
  onSelectGate: (gate: PipelineGate) => void;
  simulationMode: SimulationType;
  onSimulationFinish: (
    outcome: string,
    type: "allow" | "redact" | "escalate" | "deny",
  ) => void;
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
  const isDemo = gate.status === "Demo Detector";
  const isPlanned = gate.status === "Planned (Heuristic)";

  const gateColor = isSelected
    ? "#38BDF8"
    : isDemo
      ? "#FBBF24"
      : isPlanned
        ? "#A78BFA"
        : "#2DD4A7";

  return (
    <group
      position={[gate.positionX, 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "auto")}
    >
      {/* Outer Metallic Rim Frame */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.7, 3.4, 0.2]} />
        <meshStandardMaterial
          color={gateColor}
          wireframe={false}
          transparent
          opacity={isSelected ? 0.3 : 0.15}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      {/* Solid Translucent Glass Gate Slab */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.6, 3.3, 0.12]} />
        <meshPhysicalMaterial
          color={gateColor}
          transparent
          opacity={isSelected ? 0.45 : 0.22}
          roughness={0.1}
          metalness={0.15}
          transmission={0.6}
          thickness={0.5}
          ior={1.4}
        />
      </mesh>

      {/* Number Plate Badge on Top */}
      <group position={[0, 1.85, 0.08]}>
        <mesh>
          <boxGeometry args={[0.9, 0.36, 0.12]} />
          <meshStandardMaterial
            color="#0F172A"
            roughness={0.5}
            metalness={0.3}
          />
        </mesh>
        <Billboard>
          <Text
            fontSize={0.22}
            color={gateColor}
            anchorX="center"
            anchorY="middle"
          >
            {gate.step < 10 ? `0${gate.step}` : `${gate.step}`}
          </Text>
        </Billboard>
      </group>

      {/* Billboard Gate Title & Status */}
      <Billboard position={[0, 2.55, 0]}>
        <Text
          fontSize={0.32}
          color={isSelected ? "#38BDF8" : "#F8FAFC"}
          anchorX="center"
          anchorY="bottom"
          maxWidth={3.8}
          textAlign="center"
        >
          {gate.name}
        </Text>
        <Text
          position={[0, -0.32, 0]}
          fontSize={0.22}
          color={gateColor}
          anchorX="center"
          anchorY="top"
        >
          {gate.status}
        </Text>
      </Billboard>
    </group>
  );
}

function JourneyRailAndBranches() {
  return (
    <group>
      {/* Main Track Dual Rails */}
      <mesh position={[0, -1.7, 0.4]}>
        <boxGeometry args={[32, 0.06, 0.06]} />
        <meshBasicMaterial color="#38BDF8" transparent opacity={0.35} />
      </mesh>
      <mesh position={[0, -1.7, -0.4]}>
        <boxGeometry args={[32, 0.06, 0.06]} />
        <meshBasicMaterial color="#38BDF8" transparent opacity={0.35} />
      </mesh>

      {/* 4 Outcome Branch Rails & Pods */}
      {OUTCOME_BRANCHES.map((branch) => {
        const [targetX, targetY, targetZ] = branch.position;
        return (
          <group key={branch.id}>
            {/* Connecting Filament from Gate 08 (14, 0, 0) to Pod */}
            <line>
              <bufferGeometry
                attach="geometry"
                onUpdate={(geom) => {
                  const points = [
                    new THREE.Vector3(14, 0, 0),
                    new THREE.Vector3(16.5, targetY * 0.5, 0),
                    new THREE.Vector3(targetX, targetY, targetZ),
                  ];
                  const curve = new THREE.CatmullRomCurve3(points);
                  const curvePoints = curve.getPoints(24);
                  geom.setFromPoints(curvePoints);
                }}
              />
              <lineBasicMaterial
                attach="material"
                color={branch.color}
                transparent
                opacity={0.45}
                linewidth={1.5}
              />
            </line>

            {/* Destination Pod Node */}
            <group position={[targetX, targetY, targetZ]}>
              <mesh>
                <sphereGeometry args={[0.42, 24, 24]} />
                <meshStandardMaterial
                  color={branch.color}
                  emissive={branch.color}
                  emissiveIntensity={1.2}
                  roughness={0.2}
                />
              </mesh>

              {/* Orbiting Ring for Escalate pod */}
              {branch.id === "escalate" && (
                <mesh rotation={[Math.PI / 4, 0, 0]}>
                  <torusGeometry args={[0.7, 0.04, 16, 32]} />
                  <meshBasicMaterial color={branch.color} transparent opacity={0.7} />
                </mesh>
              )}

              {/* Pod Billboard Label */}
              <Billboard position={[1.4, 0, 0]}>
                <Text
                  fontSize={0.28}
                  color={branch.color}
                  anchorX="left"
                  anchorY="middle"
                >
                  {branch.name}
                </Text>
              </Billboard>
            </group>
          </group>
        );
      })}
    </group>
  );
}

function PacketSystem({
  simulationMode,
  onSimulationFinish,
  onPacketMove,
}: {
  simulationMode: SimulationType;
  onSimulationFinish: (
    outcome: string,
    type: "allow" | "redact" | "escalate" | "deny",
  ) => void;
  onPacketMove: (x: number) => void;
}) {
  const idlePacketRef = useRef<THREE.Mesh>(null);
  const activePacketRef = useRef<THREE.Mesh>(null);
  const shatterGroupRef = useRef<THREE.Group>(null);

  const [shattered, setShattered] = useState(false);
  const shatterProgressRef = useRef(0);
  const progressRef = useRef(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    progressRef.current = 0;
    shatterProgressRef.current = 0;
    finishedRef.current = false;
    setShattered(false);
    if (activePacketRef.current) {
      activePacketRef.current.position.set(-16, 0, 0);
    }
  }, [simulationMode]);

  // Pre-generate shatter fragment vectors
  const shatterVectors = useMemo(() => {
    return Array.from({ length: 12 }, () =>
      new THREE.Vector3(
        (Math.random() - 0.5) * 2.5,
        (Math.random() - 0.5) * 2.5,
        (Math.random() - 0.5) * 2.5,
      ).normalize(),
    );
  }, []);

  useFrame((_, delta) => {
    // 1. Idle background packet loop
    if (simulationMode === "idle" && idlePacketRef.current) {
      idlePacketRef.current.position.x += delta * 6;
      if (idlePacketRef.current.position.x > 14) {
        idlePacketRef.current.position.x = -16;
      }
      onPacketMove(idlePacketRef.current.position.x);
      return;
    }

    if (simulationMode === "idle") {
      return;
    }

    // 2. Active simulation modes
    if (finishedRef.current) return;

    if (simulationMode === "attack") {
      const attackSpeed = 14;
      progressRef.current += delta * attackSpeed;
      const currentX = -16 + progressRef.current;
      onPacketMove(currentX);

      if (!shattered && activePacketRef.current) {
        activePacketRef.current.position.set(currentX, 0, 0);

        // Trip injection at Gate 03 (x = -6)
        if (currentX >= -6) {
          setShattered(true);
        }
      }

      if (shattered) {
        shatterProgressRef.current += delta * 3;
        if (shatterGroupRef.current) {
          shatterGroupRef.current.scale.setScalar(1 + shatterProgressRef.current * 1.5);
        }
        if (shatterProgressRef.current >= 0.8 && !finishedRef.current) {
          finishedRef.current = true;
          onSimulationFinish(
            "Prompt injection shattered at Gate 03 (Rule R4 / Fail Closed).",
            "deny",
          );
        }
      }
      return;
    }

    // Benign, PII, Bulk Export simulations
    const simSpeed = 16;
    progressRef.current += delta * simSpeed;
    const currentX = -16 + progressRef.current;
    onPacketMove(Math.min(currentX, 19));

    if (activePacketRef.current) {
      if (currentX <= 14) {
        // Traveling along main track
        activePacketRef.current.position.set(currentX, 0, 0);
      } else {
        // Branching from Gate 08 (14, 0, 0) to respective pod at (19, targetY, 0)
        const t = Math.min((currentX - 14) / 5, 1);
        let targetY = 2.2; // default allow
        if (simulationMode === "pii") targetY = 0.7;
        else if (simulationMode === "bulk_export") targetY = -0.7;

        activePacketRef.current.position.set(
          14 + t * 5,
          targetY * t,
          0,
        );

        if (t >= 1 && !finishedRef.current) {
          finishedRef.current = true;
          if (simulationMode === "benign") {
            onSimulationFinish(
              "Allowed: Verified capability grant, executed at Tool Pod (Rule R1).",
              "allow",
            );
          } else if (simulationMode === "pii") {
            onSimulationFinish(
              "Redacted: PII entities masked at Gate 04, delivered sanitized (Rule R2).",
              "redact",
            );
          } else if (simulationMode === "bulk_export") {
            onSimulationFinish(
              "Escalated: Bulk export exceeded threshold, held at Human Approval Pod (Rule R3).",
              "escalate",
            );
          }
        }
      }
    }
  });

  // Color selection based on simulation mode and position
  let packetColor = "#2DD4A7"; // Default emerald
  if (simulationMode === "attack") {
    packetColor = "#F43F5E"; // Red
  } else if (simulationMode === "pii") {
    packetColor = progressRef.current > 14 ? "#F59E0B" : "#38BDF8"; // Amber after gate 04
  } else if (simulationMode === "bulk_export") {
    packetColor = progressRef.current > 18 ? "#A855F7" : "#38BDF8"; // Purple after gate 05
  }

  return (
    <group>
      {/* Idle Looping Packet */}
      {simulationMode === "idle" && (
        <mesh ref={idlePacketRef} position={[-16, 0, 0]}>
          <sphereGeometry args={[0.34, 32, 32]} />
          <meshStandardMaterial
            color="#38BDF8"
            emissive="#38BDF8"
            emissiveIntensity={2}
          />
        </mesh>
      )}

      {/* Active Simulation Packet */}
      {simulationMode !== "idle" && !shattered && (
        <mesh ref={activePacketRef} position={[-16, 0, 0]}>
          <sphereGeometry args={[0.35, 32, 32]} />
          <meshStandardMaterial
            color={packetColor}
            emissive={packetColor}
            emissiveIntensity={2.5}
          />
        </mesh>
      )}

      {/* Shattered Fragments (Attack Mode) */}
      {shattered && (
        <group ref={shatterGroupRef} position={[-6, 0, 0]}>
          {shatterVectors.map((vec, idx) => (
            <mesh
              key={idx}
              position={[vec.x * 1.2, vec.y * 1.2, vec.z * 1.2]}
            >
              <tetrahedronGeometry args={[0.15, 0]} />
              <meshStandardMaterial
                color="#F43F5E"
                emissive="#F43F5E"
                emissiveIntensity={3}
                wireframe
              />
            </mesh>
          ))}
          {/* Shockwave expanding ring */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.0, 1.15, 32]} />
            <meshBasicMaterial
              color="#F43F5E"
              transparent
              opacity={0.8}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}

function CameraRig({
  selectedGate,
  packetX,
  isSimulating,
}: {
  selectedGate: PipelineGate;
  packetX: number;
  isSimulating: boolean;
}) {
  const { camera } = useThree();

  useFrame(() => {
    // When simulating, follow packet with boundary clamp; else dolly to selected gate
    const targetX = isSimulating
      ? THREE.MathUtils.clamp(packetX, -14, 18)
      : selectedGate.positionX;

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.06);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, 1.2, 0.04);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, 9.2, 0.04);
  });

  return null;
}

export function AgentJourney3DScene({
  selectedGate,
  onSelectGate,
  simulationMode,
  onSimulationFinish,
}: AgentJourney3DSceneProps) {
  const [packetX, setPacketX] = useState(-14);
  const isSimulating = simulationMode !== "idle";

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 15]} intensity={1.4} />
      <pointLight position={[0, 4, 6]} intensity={1.0} color="#38BDF8" />

      <CameraRig
        selectedGate={selectedGate}
        packetX={packetX}
        isSimulating={isSimulating}
      />

      <JourneyRailAndBranches />

      {PIPELINE_GATES.map((gate) => (
        <GateMesh
          key={gate.id}
          gate={gate}
          isSelected={gate.id === selectedGate.id}
          onSelect={() => onSelectGate(gate)}
        />
      ))}

      <PacketSystem
        simulationMode={simulationMode}
        onSimulationFinish={onSimulationFinish}
        onPacketMove={setPacketX}
      />

      <OrbitControls
        enableRotate={true}
        enableZoom={true}
        enablePan={true}
        minDistance={5}
        maxDistance={28}
        maxPolarAngle={Math.PI / 2 + 0.1}
      />
    </>
  );
}
