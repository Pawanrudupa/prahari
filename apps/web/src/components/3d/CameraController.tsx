import { useRef, useEffect, useMemo, useState, type ComponentRef } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useGraphStore } from "../../stores/useGraphStore";

interface CameraControllerProps {
  agentPositions: Map<string, [number, number, number]>;
  toolPositions: Map<string, [number, number, number]>;
  reducedMotion?: boolean;
}

export interface OverlayOffsets {
  offsetX: number;
  offsetY: number;
  zoomScale: number;
}

/**
 * Dynamically derives framing offsets from measured DOM overlay panels
 * (event feed, legend, simulator bar, left rail) rather than hardcoded offsets.
 * Seamlessly adapts when panels are collapsed or window is resized.
 */
export function measureOverlayOffsets(
  viewportWidth: number = typeof window !== "undefined" ? window.innerWidth : 1280,
  viewportHeight: number = typeof window !== "undefined" ? window.innerHeight : 720,
): OverlayOffsets {
  if (typeof document === "undefined" || viewportWidth <= 0 || viewportHeight <= 0) {
    return { offsetX: 0, offsetY: 0, zoomScale: 1.0 };
  }

  // Left rail / navigation width
  const leftRail =
    document.querySelector('[data-testid="left-rail"]') || document.querySelector("nav");
  const leftInset = leftRail ? Math.max(0, leftRail.getBoundingClientRect().right) : 64;

  // Right overlays (LiveEventFeed and Legend)
  const feedEl =
    document.querySelector('[data-testid="live-event-feed"]') ||
    document.getElementById("hud-live-event-feed");
  const legendEl =
    document.querySelector('[data-testid="constellation-legend"]') ||
    document.getElementById("hud-constellation-legend");

  let rightInset = 0;
  if (feedEl) {
    const rect = feedEl.getBoundingClientRect();
    if (rect.width > 0 && rect.right <= viewportWidth + 10) {
      rightInset = Math.max(rightInset, viewportWidth - rect.left);
    }
  }
  if (legendEl) {
    const rect = legendEl.getBoundingClientRect();
    if (rect.width > 0 && rect.right <= viewportWidth + 10) {
      rightInset = Math.max(rightInset, viewportWidth - rect.left);
    }
  }

  // Bottom overlays (Simulator bar)
  const simBar =
    document.querySelector('[data-testid="simulator-bar"]') ||
    document.getElementById("hud-simulator-bar");
  let bottomInset = 0;
  if (simBar) {
    const rect = simBar.getBoundingClientRect();
    if (rect.height > 0 && rect.bottom <= viewportHeight + 10) {
      bottomInset = Math.max(bottomInset, viewportHeight - rect.top);
    }
  }

  // Top overlay (KPI strip)
  const kpiEl =
    document.querySelector('[data-testid="kpi-strip"]') ||
    document.getElementById("hud-kpi-strip") ||
    document.querySelector("header");
  let topInset = 0;
  if (kpiEl) {
    const rect = kpiEl.getBoundingClientRect();
    if (rect.height > 0) {
      topInset = Math.max(topInset, rect.bottom);
    }
  }

  // Horizontal world offset:
  // If rightInset > leftInset, visible center is shifted left on screen.
  // Shifting the camera target to +X shifts world origin to the left, centering it.
  const worldFramingFactorX = 14.0;
  const offsetX = Number(
    (((rightInset - leftInset) / viewportWidth) * worldFramingFactorX).toFixed(2)
  );

  // Vertical world offset:
  // If bottomInset > topInset, visible center is shifted up on screen.
  // Shifting the camera target to +Y shifts world origin up, centering it.
  const worldFramingFactorY = 8.0;
  const offsetY = Number(
    (((bottomInset - topInset) / viewportHeight) * worldFramingFactorY).toFixed(2)
  );

  // Zoom scale: ensures graph fits into unobstructed window portion
  const visibleWidthRatio = Math.max(0.4, (viewportWidth - leftInset - rightInset) / viewportWidth);
  const visibleHeightRatio = Math.max(0.4, (viewportHeight - topInset - bottomInset) / viewportHeight);
  const zoomScale = Number((1.0 / Math.min(visibleWidthRatio, visibleHeightRatio)).toFixed(2));

  return { offsetX, offsetY, zoomScale };
}

function computeOverviewCameraPos(
  agentPositions: Map<string, [number, number, number]>,
  toolPositions: Map<string, [number, number, number]>,
  offsets: OverlayOffsets,
): THREE.Vector3 {
  let maxR = 16.5;
  for (const pos of agentPositions.values()) {
    const r = Math.hypot(pos[0], pos[1], pos[2]);
    if (r > maxR) maxR = r;
  }
  for (const pos of toolPositions.values()) {
    const r = Math.hypot(pos[0], pos[1], pos[2]);
    if (r > maxR) maxR = r;
  }

  const dist = Math.max(30, maxR * 1.55 * Math.min(offsets.zoomScale, 1.35));
  return new THREE.Vector3(
    offsets.offsetX,
    Number((dist * 0.48 + offsets.offsetY).toFixed(2)),
    Number((dist * 0.95).toFixed(2)),
  );
}

export function CameraController({
  agentPositions,
  toolPositions,
  reducedMotion = false,
}: CameraControllerProps) {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, gl } = useThree();

  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const selectNode = useGraphStore((s) => s.selectNode);
  const cameraPreset = useGraphStore((s) => s.cameraPreset);

  const [offsets, setOffsets] = useState<OverlayOffsets>(() => measureOverlayOffsets());

  // Observe resize and panel collapse/expand
  useEffect(() => {
    const updateOffsets = () => {
      setOffsets(measureOverlayOffsets(window.innerWidth, window.innerHeight));
    };

    window.addEventListener("resize", updateOffsets);

    const observer = new MutationObserver(() => {
      updateOffsets();
    });
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });

    const timer = setTimeout(updateOffsets, 150);

    return () => {
      window.removeEventListener("resize", updateOffsets);
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  const defaultTarget = useMemo(
    () => new THREE.Vector3(offsets.offsetX, offsets.offsetY, 0),
    [offsets.offsetX, offsets.offsetY]
  );

  // Compute overview pos based on layout and dynamic offsets
  const overviewPos = useMemo(
    () => computeOverviewCameraPos(agentPositions, toolPositions, offsets),
    [agentPositions, toolPositions, offsets],
  );

  // Desired target & camera position refs
  const targetFocus = useRef<THREE.Vector3>(defaultTarget.clone());
  const cameraFocus = useRef<THREE.Vector3>(overviewPos.clone());
  const isTransitioning = useRef<boolean>(true);

  // Handle camera presets & node selection
  useEffect(() => {
    if (cameraPreset === "top_down") {
      targetFocus.current.copy(defaultTarget);
      const dist = Math.max(30, overviewPos.length());
      cameraFocus.current.set(offsets.offsetX, dist, offsets.offsetY + 0.001);
      isTransitioning.current = true;
      return;
    }

    if (cameraPreset === "follow_agent") {
      let targetPos: [number, number, number] | undefined;
      if (selectedNodeId) {
        targetPos = agentPositions.get(selectedNodeId);
      }
      if (!targetPos && agentPositions.size > 0) {
        targetPos = Array.from(agentPositions.values())[0];
      }

      if (targetPos) {
        targetFocus.current.set(targetPos[0], targetPos[1], targetPos[2]);
        cameraFocus.current.set(targetPos[0] + 3.5, targetPos[1] + 2.0, targetPos[2] + 4.0);
        isTransitioning.current = true;
        return;
      }
    }

    // Default overview or node focus
    if (!selectedNodeId) {
      targetFocus.current.copy(defaultTarget);
      cameraFocus.current.copy(overviewPos);
      isTransitioning.current = true;
      return;
    }

    const pos =
      agentPositions.get(selectedNodeId) || toolPositions.get(selectedNodeId);

    if (pos) {
      targetFocus.current.set(pos[0], pos[1], pos[2]);
      const dir = new THREE.Vector3(pos[0], pos[1], pos[2]).normalize();
      if (dir.lengthSq() < 0.001) dir.set(0, 0, 1);
      cameraFocus.current.set(
        pos[0] + dir.x * 4,
        pos[1] + 2.5,
        pos[2] + dir.z * 4,
      );
      isTransitioning.current = true;
    }
  }, [cameraPreset, selectedNodeId, agentPositions, toolPositions, overviewPos, defaultTarget, offsets]);

  // Double click canvas background to reset camera to overview
  useEffect(() => {
    const handleDblClick = () => {
      selectNode(null);
    };

    const domElement = gl.domElement;
    domElement.addEventListener("dblclick", handleDblClick);
    return () => {
      domElement.removeEventListener("dblclick", handleDblClick);
    };
  }, [gl, selectNode]);

  // Smooth lerp damping in useFrame
  useFrame(() => {
    if (!controlsRef.current) return;

    if (isTransitioning.current) {
      if (reducedMotion) {
        controlsRef.current.target.copy(targetFocus.current);
        camera.position.copy(cameraFocus.current);
        isTransitioning.current = false;
      } else {
        controlsRef.current.target.lerp(targetFocus.current, 0.08);
        camera.position.lerp(cameraFocus.current, 0.08);

        const targetDist = controlsRef.current.target.distanceTo(targetFocus.current);
        const camDist = camera.position.distanceTo(cameraFocus.current);

        if (targetDist < 0.02 && camDist < 0.02) {
          controlsRef.current.target.copy(targetFocus.current);
          camera.position.copy(cameraFocus.current);
          isTransitioning.current = false;
        }
      }
      controlsRef.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.05}
      maxDistance={85}
      minDistance={4}
      maxPolarAngle={Math.PI / 2 + 0.1}
    />
  );
}
