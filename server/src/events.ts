// In-process event bus. The browser receives these over server-sent events
// and refreshes whatever views depend on the area that changed.

export type Area = "sessions" | "jobs" | "projects" | "library" | "settings" | "memory" | "live" | "archive";

export interface AppEvent {
  area: Area;
  path?: string;
  data?: unknown;
}

type Listener = (e: AppEvent) => void;
const listeners = new Set<Listener>();

export function emit(e: AppEvent) {
  for (const l of listeners) l(e);
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
