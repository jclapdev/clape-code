import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { appDir } from "./fs/paths";

// Local-only counts for the post-launch review: which views get used, edits saved,
// conflicts caught, sessions answered from the browser. Nothing leaves this machine.
const file = () => join(appDir(), "metrics.json");

let counts: Record<string, number> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

async function load() {
  if (counts) return counts;
  try {
    counts = JSON.parse(await readFile(file(), "utf8"));
  } catch {
    counts = {};
  }
  return counts!;
}

export async function bump(key: string) {
  const c = await load();
  c[key] = (c[key] ?? 0) + 1;
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    await mkdir(dirname(file()), { recursive: true });
    await writeFile(file() + ".tmp", JSON.stringify(counts, null, 2));
    await rename(file() + ".tmp", file());
  }, 1000);
}

/** Which count a successful API request adds to, if any. */
export function metricFor(method: string, path: string): string | null {
  if (method === "PUT" && path === "/api/file") return "edits.saved";
  if (/^\/api\/projects\/.+\/(backlog|changelog)/.test(path)) return "edits.saved";
  if (method !== "POST") return null;
  if (/^\/api\/(live\/[^/]+|sessions\/[^/]+)\/respond$/.test(path)) return "live.answered";
  if (path === "/api/sessions/new") return "live.started";
  if (/^\/api\/(library|sessions)\/archive$/.test(path)) return "items.archived";
  if (/^\/api\/(library|sessions)\/delete$/.test(path)) return "items.deleted";
  return null;
}

export const getMetrics = async () => ({ ...(await load()) });
