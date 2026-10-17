import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

// Which query keys depend on which server area.
const DEPENDS: Record<string, string[][]> = {
  sessions: [["sessions"], ["session"], ["overview"], ["projects"], ["project"]],
  jobs: [["jobs"], ["job"], ["overview"]],
  projects: [["projects"], ["project"], ["overview"], ["file"]],
  library: [["library"], ["file"], ["project"], ["map"]],
  settings: [["settings"], ["library"], ["file"], ["map"]],
  memory: [["library"], ["memory"], ["file"]],
  live: [["live"], ["overview"]],
  archive: [["archive"], ["library"]],
};

let waitingNow = 0;
const waitingListeners = new Set<(n: number) => void>();
export function useWaiting() {
  const [n, setN] = useState(waitingNow);
  useEffect(() => {
    waitingListeners.add(setN);
    return () => void waitingListeners.delete(setN);
  }, []);
  return n;
}

function notify(n: number) {
  if (n > waitingNow && document.hidden && "Notification" in window && Notification.permission === "granted") {
    new Notification("Claude needs you", { body: n === 1 ? "A session is waiting for your answer." : `${n} sessions are waiting for your answer.` });
  }
  waitingNow = n;
  document.title = n ? `(${n}) Control Center` : "Control Center";
  for (const l of waitingListeners) l(n);
}

/** Keep every view current: the server pushes which areas changed, and those queries refetch. */
export function useLiveUpdates() {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(true);
  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const open = () => {
      es = new EventSource("/api/events");
      es.addEventListener("hello", (e) => {
        setConnected(true);
        notify(JSON.parse((e as MessageEvent).data).waiting ?? 0);
        qc.invalidateQueries();
      });
      es.addEventListener("change", (e) => {
        const { areas, waiting } = JSON.parse((e as MessageEvent).data) as { areas: string[]; waiting: number };
        notify(waiting);
        const keys = new Set<string>();
        for (const a of areas) for (const k of DEPENDS[a] ?? []) keys.add(k[0]);
        for (const k of keys) qc.invalidateQueries({ queryKey: [k] });
      });
      es.onerror = () => {
        setConnected(false);
        es?.close();
        retry = setTimeout(open, 3000);
      };
    };
    open();
    return () => {
      es?.close();
      if (retry) clearTimeout(retry);
    };
  }, [qc]);
  return connected;
}
