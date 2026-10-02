import { Suspense, useMemo, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useGraphStore } from "../../stores/useGraphStore";
import { computeGraphLayout } from "../../utils/layout";
import { PolicyShield } from "./PolicyShield";
import { AgentNodesMesh } from "./AgentNodesMesh";
import { ToolNodesMesh } from "./ToolNodesMesh";
import { GrantEdgesMesh } from "./GrantEdgesMesh";
import { ParticlePool } from "./ParticlePool";
import { CameraController } from "./CameraController";

interface ConstellationCanvasProps {
  isDegraded?: boolean;
  reducedMotion?: boolean;
}

function SceneContent({ isDegraded, reducedMotion }: ConstellationCanvasProps) {
  const agents = useGraphStore((s) => s.agents);
  const tools = useGraphStore((s) => s.tools);

  const agentsList = useMemo(() => Array.from(agents.values()), [agents]);
  const toolsList = useMemo(() => Array.from(tools.values()), [tools]);

  const layout = useMemo(
    () => computeGraphLayout(agentsList, toolsList),
    [agentsList, toolsList],
  );

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 15, 10]} intensity={1.2} />
      <pointLight position={[0, 0, 0]} intensity={1.0} color="#38BDF8" distance={12} />

      <PolicyShield />
      <AgentNodesMesh agentPositions={layout.agentPositions} />
      <ToolNodesMesh toolPositions={layout.toolPositions} />
      <GrantEdgesMesh
        agentPositions={layout.agentPositions}
        toolPositions={layout.toolPositions}
      />
      <ParticlePool
        agentPositions={layout.agentPositions}
        toolPositions={layout.toolPositions}
        isDegraded={isDegraded}
        reducedMotion={reducedMotion}
      />
      <CameraController
        agentPositions={layout.agentPositions}
        toolPositions={layout.toolPositions}
        reducedMotion={reducedMotion}
      />

      {/* Postprocessing Bloom: disabled in degraded mode or reduced motion */}
      {!isDegraded && !reducedMotion && (
        <EffectComposer multisampling={0}>
          <Bloom
            intensity={0.4}
            luminanceThreshold={0.7}
            luminanceSmoothing={0.3}
            mipmapBlur
          />
        </EffectComposer>
      )}
    </>
  );
}

export function ConstellationCanvas({
  isDegraded = false,
  reducedMotion = false,
}: ConstellationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const setWebglLost = useGraphStore((s) => s.setWebglLost);

  // Monitor WebGL Context Loss on the canvas element
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = container.querySelector("canvas");
    if (!canvas) return;

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglLost(true);
    };

    const handleContextRestored = () => {
      setWebglLost(false);
    };

    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    };
  }, [setWebglLost]);

  return (
    <div ref={containerRef} className="h-full w-full relative">
      <Canvas
        camera={{ position: [0, 12, 22], fov: 50 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        dpr={isDegraded ? [1, 1] : [1, 2]}
        style={{ background: "#070A12" }}
      >
        <Suspense fallback={null}>
          <SceneContent isDegraded={isDegraded} reducedMotion={reducedMotion} />
        </Suspense>
      </Canvas>
    </div>
  );
}
