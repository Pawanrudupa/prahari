import { create } from "zustand";

interface AppState {
  reducedMotion: boolean;
  setReducedMotion: (value: boolean) => void;
  webglSupported: boolean;
  setWebglSupported: (value: boolean) => void;
  qualityMode: "auto" | "high" | "low";
  setQualityMode: (mode: "auto" | "high" | "low") => void;
}

const savedMotion = typeof window !== "undefined" ? localStorage.getItem("prahari_reduced_motion") : null;
const prefersReducedMotion =
  savedMotion !== null
    ? savedMotion === "true"
    : typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

const savedQuality = typeof window !== "undefined" ? (localStorage.getItem("prahari_quality_mode") as "auto" | "high" | "low" | null) : null;
const initialQuality = savedQuality || "auto";

export const useAppStore = create<AppState>((set) => ({
  reducedMotion: prefersReducedMotion,
  setReducedMotion: (value) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("prahari_reduced_motion", String(value));
      } catch {
        // Ignore quota/private mode errors
      }
    }
    set({ reducedMotion: value });
  },
  webglSupported: true,
  setWebglSupported: (value) => set({ webglSupported: value }),
  qualityMode: initialQuality,
  setQualityMode: (mode) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("prahari_quality_mode", mode);
      } catch {
        // Ignore quota/private mode errors
      }
    }
    set({ qualityMode: mode });
  },
}));
