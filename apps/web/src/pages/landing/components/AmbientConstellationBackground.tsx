import { useRef, useState, useEffect, Suspense, lazy } from "react";
import { isWebGLAvailable, prefersReducedMotion } from "../../../utils/webgl";

// Lazy load Canvas so Three.js bundle is loaded only when WebGL is active
const LazyCanvas = lazy(() =>
  import("@react-three/fiber").then((mod) => ({ default: mod.Canvas })),
);

function AmbientParticles() {
  const meshRef = useRef<any>(null);
  const [Three, setThree] = useState<any>(null);

  useEffect(() => {
    import("three").then((mod) => setThree(mod));
  }, []);

  useEffect(() => {
    if (!Three || !meshRef.current) return;
    const count = 70;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 35;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 25;
    }
    meshRef.current.geometry.setAttribute(
      "position",
      new Three.BufferAttribute(positions, 3),
    );
  }, [Three]);

  return (
    <points ref={meshRef}>
      <bufferGeometry />
      <pointsMaterial
        size={0.12}
        color="#38BDF8"
        transparent
        opacity={0.35}
        sizeAttenuation
      />
    </points>
  );
}

function AmbientShield() {
  return (
    <mesh position={[0, 0, 0]}>
      <sphereGeometry args={[2.5, 32, 32]} />
      <meshBasicMaterial
        color="#38BDF8"
        wireframe
        transparent
        opacity={0.12}
      />
    </mesh>
  );
}

export function AmbientConstellationBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [canRender3D, setCanRender3D] = useState(false);

  useEffect(() => {
    const isSupported = isWebGLAvailable() && !prefersReducedMotion();
    setCanRender3D(isSupported);

    if (!containerRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.05 },
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none overflow-hidden z-0"
      aria-hidden="true"
    >
      {/* Layered radial glow backdrop */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-cyan-600/[0.08] blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 left-1/3 w-[500px] h-[350px] bg-blue-600/[0.05] blur-[120px] rounded-full pointer-events-none" />

      {/* Grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)]" />

      {/* 3D Ambient Scene */}
      {canRender3D && isVisible && (
        <Suspense fallback={null}>
          <LazyCanvas
            camera={{ position: [0, 0, 15], fov: 45 }}
            gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
            dpr={[1, 1.5]}
            className="w-full h-full opacity-60"
          >
            <ambientLight intensity={0.4} />
            <AmbientShield />
            <AmbientParticles />
          </LazyCanvas>
        </Suspense>
      )}
    </div>
  );
}
