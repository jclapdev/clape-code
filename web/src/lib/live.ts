import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

// Which query keys depend on which server area.
const DEPENDS: Record<string, string[][]> = {
  sessions: [["sessions"], ["session"], ["overview"], ["projects"], ["project"], ["menu"]],
  jobs: [["jobs"], ["job"], ["overview"], ["menu"]],
  projects: [["projects"], ["project"], ["overview"], ["file"], ["suggested"]],
  library: [["library"], ["file"], ["project"], ["map"], ["suggested"]],
  settings: [["settings"], ["library"], ["file"], ["map"]],
  memory: [["library"], ["memory"], ["file"]],
  live: [["live"], ["overview"], ["menu"]],
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

// The tab shows how many sessions wait for you, then the page you're on: "(1) cka-prep – Control Center".
let pageName = "";
function applyTitle() {
  const base = pageName ? `${pageName} – Control Center` : "Control Center";
  document.title = waitingNow ? `(${waitingNow}) ${base}` : base;
}
export function setPageTitle(name: string) {
  pageName = name;
  applyTitle();
}

function notify(n: number) {
  if (n > waitingNow && document.hidden && "Notification" in window && Notification.permission === "granted") {
    new Notification("Claude needs you", { body: n === 1 ? "A session is waiting for your answer." : `${n} sessions are waiting for your answer.` });
  }
  waitingNow = n;
  applyTitle();
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
