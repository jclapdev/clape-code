// Typed text that survives leaving the page: kept in this browser's storage under one key per box or form,
// read back on return and removed once it's sent or saved. Storage can be unavailable, so layoutStorage guards each access.
import { useCallback, useRef, useState } from "react";
import { layoutStorage } from "./prefs";

/** The storage key for a box or form, such as draftKey("reply", sessionId). */
export const draftKey = (...parts: string[]) => `cc-draft:${parts.join(":")}`;

/** A stored draft, or the fallback. Text is stored as it is; a form's fields as JSON, laid over the fallback's. */
export function readDraft<T>(key: string, fallback: T): T {
  const raw = layoutStorage.getItem(key);
  if (raw === null) return fallback;
  if (typeof fallback === "string") return raw as T;
  try {
    const v = JSON.parse(raw);
    return fallback && typeof fallback === "object" && v && typeof v === "object" ? { ...fallback, ...v } : (v as T);
  } catch {
    return fallback;
  }
}

function writeDraft<T>(key: string, v: T) {
  if (v === "") layoutStorage.removeItem(key);
  else layoutStorage.setItem(key, typeof v === "string" ? v : JSON.stringify(v));
}

/**
 * State kept as a draft under `key`. `pinned` values, such as ones the address fills in, win over the stored ones.
 * Returns the value, a setter that also stores it, and `clear`, which forgets the draft and goes back to the fallback.
 */
export function useDraft<T>(key: string, fallback: T, pinned?: Partial<T> | T) {
  const load = () => {
    const stored = readDraft(key, fallback);
    if (pinned === undefined) return stored;
    return stored && typeof stored === "object" ? ({ ...stored, ...(pinned as object) } as T) : (pinned as T);
  };
  const [s, setS] = useState(() => ({ key, value: load() }));
  const empty = useRef(fallback);
  empty.current = fallback;
  let value = s.value;
  if (s.key !== key) {
    // Another conversation or kind of item: its own draft.
    value = load();
    setS({ key, value });
  }
  const set = useCallback(
    (next: T | ((prev: T) => T)) =>
      setS((cur) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(cur.value) : next;
        writeDraft(cur.key, v);
        return { key: cur.key, value: v };
      }),
    [],
  );
  const clear = useCallback(() => {
    setS((cur) => {
      layoutStorage.removeItem(cur.key);
      return { key: cur.key, value: empty.current };
    });
  }, []);
  return [value, set, clear] as const;
}

/** A form's fields as one draft, with a setter per field. */
export function useDraftForm<T extends Record<string, unknown>>(key: string, fallback: T, pinned?: Partial<T>) {
  const [form, set, clear] = useDraft<T>(key, fallback, pinned);
  const field = useCallback(<K extends keyof T>(k: K) => (v: T[K]) => set((p) => ({ ...p, [k]: v })), [set]);
  return [form, field, clear] as const;
}
