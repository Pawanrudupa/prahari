import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stats } from "@react-three/drei";
import { Suspense } from "react";
import { useAppStore } from "../stores/appStore";

function Scene() {
  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <OrbitControls makeDefault />
      {/* Placeholder sphere to prove the scene works */}
      <mesh>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshStandardMaterial color="#2DD4A7" emissive="#2DD4A7" emissiveIntensity={0.3} />
      </mesh>
    </>
  );
}

function FallbackView() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center text-[var(--color-text-muted)]">
        <p className="text-xl">3D view not available</p>
        <p className="mt-2 text-sm">WebGL is not supported — 2D view coming soon</p>
      </div>
    </div>
  );
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

export function Constellation() {
  const reducedMotion = useAppStore((s) => s.reducedMotion);

  if (!hasWebGL()) {
    return <FallbackView />;
  }

  return (
    <div className="h-full w-full">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 60 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
        style={{ background: "#070A12" }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
        {import.meta.env.DEV && <Stats />}
      </Canvas>
      {reducedMotion && (
        <div className="absolute bottom-4 left-4 rounded bg-white/10 px-2 py-1 text-xs text-[var(--color-text-muted)]">
          Reduced motion active
        </div>
      )}
    </div>
  );
}
