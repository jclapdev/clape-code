import { useSyncExternalStore } from "react";

// Pane sizes are a per-browser convenience. Storage can be unavailable (private windows), so every access is guarded.
export const layoutStorage = {
  getItem: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
  removeItem: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {}
  },
};

export function useMediaQuery(q: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(q);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(q).matches,
  );
}
