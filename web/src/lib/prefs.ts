import { useEffect, useState, useSyncExternalStore } from "react";

// Per-browser conveniences. Storage can be unavailable (private windows), so every access is guarded.
export function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

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
};

export type Theme = "system" | "light" | "dark";

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem("cc-theme") as Theme) || "system";
    } catch {
      return "system";
    }
  });
  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("cc-theme", theme);
    } catch {}
  }, [theme]);
  return [theme, setTheme];
}

/** True when the effective theme is dark, for components that need it in JS (the code editor). */
export function useIsDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const mo = new MutationObserver(cb);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      mq.addEventListener("change", cb);
      return () => {
        mo.disconnect();
        mq.removeEventListener("change", cb);
      };
    },
    () => {
      const t = document.documentElement.getAttribute("data-theme");
      return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    },
  );
}

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
