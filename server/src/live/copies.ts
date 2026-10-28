import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { appDir } from "../fs/paths";

// Every copy Control Center makes of a conversation open in another window (`forkSession`), so the copy can say it is
// one: Claude Code gives it the original's title. Kept in the app folder: copy's session ID -> original's session ID.

const file = () => join(appDir(), "session-copies.json");
const UUID = /^[0-9a-f-]{36}$/i;
let cache: Record<string, string> | null = null;
let queue: Promise<unknown> = Promise.resolve();

export async function sessionCopies(): Promise<Record<string, string>> {
  if (cache) return cache;
  try {
    const raw = JSON.parse(await readFile(file(), "utf8"));
    cache = Object.fromEntries(Object.entries(raw && typeof raw === "object" ? raw : {}).filter(([k, v]) => UUID.test(k) && typeof v === "string" && UUID.test(v))) as Record<string, string>;
  } catch {
    cache = {};
  }
  return cache!;
}

export function recordCopy(copyId: string, originalId: string): Promise<void> {
  const next = queue.then(async () => {
    const all = await sessionCopies();
    if (copyId === originalId || all[copyId] === originalId) return;
    all[copyId] = originalId;
    await mkdir(appDir(), { recursive: true });
    const tmp = file() + ".tmp";
    await writeFile(tmp, JSON.stringify(all, null, 2));
    await rename(tmp, file());
  });
  queue = next.catch(() => {});
  return next;
}
