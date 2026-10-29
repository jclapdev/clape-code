import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { appDir } from "../fs/paths";

// The session ID of every session Clape Code starts or resumes, so its Agent SDK transcripts aren't taken for
// `claude -p` runs: both record an `entrypoint` starting with "sdk-". Kept in the app folder: sessionId -> ISO time.

const file = () => join(appDir(), "started-sessions.json");
let cache: Record<string, string> | null = null;
let queue: Promise<unknown> = Promise.resolve();

export async function startedSessions(): Promise<Record<string, string>> {
  if (cache) return cache;
  try {
    const raw = JSON.parse(await readFile(file(), "utf8"));
    cache = raw && typeof raw === "object" ? raw : {};
  } catch {
    cache = {};
  }
  return cache!;
}

export function recordStarted(sessionId: string): Promise<void> {
  const next = queue.then(async () => {
    const all = await startedSessions();
    if (all[sessionId]) return;
    all[sessionId] = new Date().toISOString();
    await mkdir(appDir(), { recursive: true });
    const tmp = file() + ".tmp";
    await writeFile(tmp, JSON.stringify(all, null, 2));
    await rename(tmp, file());
  });
  queue = next.catch(() => {});
  return next;
}

/** Hidden like Claude Code's session picker hides `claude -p` runs: an SDK entrypoint, and not one of ours. */
export const isFromScript = (entrypoint: string | null | undefined, sessionId: string, started: Record<string, string>) =>
  !!entrypoint?.startsWith("sdk-") && !started[sessionId];
