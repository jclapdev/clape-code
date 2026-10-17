import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { claudeDir, tildify } from "../fs/paths";
import { ls, readJson } from "./md";

export interface Job {
  id: string;
  name: string | null;
  state: string; // working | blocked | done | …
  detail: string | null;
  needs: unknown;
  cwd: string | null;
  sessionId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  timeline: { at: string; state: string; detail?: string; text?: string }[];
}

export interface LiveProcess {
  pid: number;
  sessionId: string;
  cwd: string | null;
  name: string | null;
  status: string | null;
  kind: string | null;
  jobId: string | null;
  alive: boolean;
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e.code === "EPERM";
  }
};

export async function listJobs(withTimeline = false): Promise<Job[]> {
  const root = join(claudeDir(), "jobs");
  const out: Job[] = [];
  for (const id of await ls(root)) {
    const s = await readJson<Record<string, any>>(join(root, id, "state.json"));
    if (!s) continue;
    let timeline: Job["timeline"] = [];
    if (withTimeline) {
      try {
        timeline = (await readFile(join(root, id, "timeline.jsonl"), "utf8"))
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l));
      } catch {
        /* no timeline */
      }
    }
    out.push({
      id,
      name: s.name ?? null,
      state: s.state ?? "unknown",
      detail: s.detail ?? null,
      needs: s.needs ?? null,
      cwd: s.cwd ? tildify(s.cwd) : null,
      sessionId: s.sessionId ?? null,
      createdAt: s.createdAt ?? null,
      updatedAt: s.updatedAt ?? null,
      timeline,
    });
  }
  return out.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

/** Claude Code processes that are running now, from sessions/<pid>.json (token files are never read). */
export async function listLiveProcesses(): Promise<LiveProcess[]> {
  const root = join(claudeDir(), "sessions");
  const out: LiveProcess[] = [];
  for (const f of await ls(root)) {
    if (!/^\d+\.json$/.test(f)) continue;
    const s = await readJson<Record<string, any>>(join(root, f));
    if (!s?.pid) continue;
    out.push({
      pid: s.pid,
      sessionId: s.sessionId,
      cwd: s.cwd ? tildify(s.cwd) : null,
      name: s.name ?? null,
      status: s.status ?? null,
      kind: s.kind ?? null,
      jobId: s.jobId ?? null,
      alive: alive(s.pid),
    });
  }
  return out.filter((p) => p.alive);
}
