import { create } from "zustand";

interface AppState {
  reducedMotion: boolean;
  setReducedMotion: (value: boolean) => void;
  webglSupported: boolean;
  setWebglSupported: (value: boolean) => void;
}

const prefersReducedMotion =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

export const useAppStore = create<AppState>((set) => ({
  reducedMotion: prefersReducedMotion,
  setReducedMotion: (value) => set({ reducedMotion: value }),
  webglSupported: true,
  setWebglSupported: (value) => set({ webglSupported: value }),
}));
