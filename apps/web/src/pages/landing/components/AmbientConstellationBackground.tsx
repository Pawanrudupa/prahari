import { useRef, useState, useEffect, Suspense, lazy } from "react";
import { isWebGLAvailable, prefersReducedMotion } from "../../../utils/webgl";

// Lazy load Canvas so Three.js bundle is loaded only when WebGL is active
const LazyCanvas = lazy(() =>
  import("@react-three/fiber").then((mod) => ({ default: mod.Canvas })),
);

function AmbientConstellationScene() {
  const pointsRef = useRef<any>(null);
  const [Three, setThree] = useState<any>(null);
  const count = 48;
  const positionsRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    import("three").then((mod) => {
      setThree(mod);
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        // Stream from x = -8 to x = +8
        pos[i * 3] = -8 + Math.random() * 16;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 6;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 4;
      }
      positionsRef.current = pos;
    });
  }, []);

  useEffect(() => {
    if (!Three || !pointsRef.current || !positionsRef.current) return;
    pointsRef.current.geometry.setAttribute(
      "position",
      new Three.BufferAttribute(positionsRef.current, 3),
    );

    let animId: number;
    const animate = () => {
      const arr = positionsRef.current;
      if (arr && pointsRef.current) {
        for (let i = 0; i < count; i++) {
          const idx = i * 3;
          arr[idx] = (arr[idx] ?? 0) + 0.02; // gently flow left to right: agents -> shield -> tools
          if ((arr[idx] ?? 0) > 8.5) {
            arr[idx] = -8.5;
            arr[idx + 1] = (Math.random() - 0.5) * 6;
          }
        }
        pointsRef.current.geometry.attributes.position.needsUpdate = true;
      }
      animId = requestAnimationFrame(animate);
    };
    animId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animId);
  }, [Three]);

  return (
    <group>
      {/* 1. Left Cluster: Agents (x = -7) */}
      <group position={[-7, 0, 0]}>
        {[-1.8, 0, 1.8].map((y, idx) => (
          <group key={idx} position={[0, y, 0]}>
            <mesh>
              <sphereGeometry args={[0.22, 16, 16]} />
              <meshBasicMaterial color="#38BDF8" transparent opacity={0.3} />
            </mesh>
            <mesh>
              <ringGeometry args={[0.35, 0.38, 16]} />
              <meshBasicMaterial color="#38BDF8" transparent opacity={0.18} side={2} />
            </mesh>
          </group>
        ))}
      </group>

      {/* 2. Center: Policy Shield (x = 0) */}
      <group position={[0, 0, 0]}>
        <mesh>
          <sphereGeometry args={[2.2, 24, 24]} />
          <meshBasicMaterial
            color="#38BDF8"
            wireframe
            transparent
            opacity={0.12}
          />
        </mesh>
        <mesh rotation={[Math.PI / 4, 0, 0]}>
          <ringGeometry args={[2.3, 2.34, 32]} />
          <meshBasicMaterial color="#2DD4A7" transparent opacity={0.15} side={2} />
        </mesh>
      </group>

      {/* 3. Right Cluster: Tools (x = +7) */}
      <group position={[7, 0, 0]}>
        {[-1.8, 0, 1.8].map((y, idx) => (
          <group key={idx} position={[0, y, 0]}>
            <mesh>
              <octahedronGeometry args={[0.25, 0]} />
              <meshBasicMaterial color="#2DD4A7" transparent opacity={0.28} wireframe />
            </mesh>
            <mesh>
              <ringGeometry args={[0.38, 0.41, 16]} />
              <meshBasicMaterial color="#2DD4A7" transparent opacity={0.15} side={2} />
            </mesh>
          </group>
        ))}
      </group>

      {/* 4. Flowing Ambient Particles (left to right) */}
      <points ref={pointsRef}>
        <bufferGeometry />
        <pointsMaterial
          size={0.12}
          color="#38BDF8"
          transparent
          opacity={0.25}
          sizeAttenuation
        />
      </points>
    </group>
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
            camera={{ position: [0, 0, 14], fov: 45 }}
            gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
            dpr={[1, 1.5]}
            className="w-full h-full opacity-60"
          >
            <ambientLight intensity={0.4} />
            <AmbientConstellationScene />
          </LazyCanvas>
        </Suspense>
      )}
    </div>
  );
}
