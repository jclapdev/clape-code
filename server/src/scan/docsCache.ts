// A page of Claude Code's docs, fetched live (like the Guides pages), kept parsed in the app folder, with a
// parsed copy shipped in the repo (scripts/) for when the computer is offline.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { appDir } from "../fs/paths";

const SIX_HOURS = 6 * 3600_000;

export type ReferenceOrigin = "live" | "cache" | "shipped";

interface Options<T> {
  url: string;
  /** The file in the app folder. */
  file: string;
  parse: (md: string) => T;
  /** False when a parse found nothing, as when the page's layout changed. */
  usable: (ref: T) => boolean;
  shipped: T;
}

export function docsCache<T extends { fetchedAt: string }>(o: Options<T>) {
  type Loaded = { ref: T; origin: ReferenceOrigin; failed?: boolean };
  let mem: { at: number; got: Loaded } | null = null;
  let inflight: Promise<Loaded> | null = null;
  const path = () => join(appDir(), o.file);

  async function readCache(): Promise<T | null> {
    try {
      const r = JSON.parse(await readFile(path(), "utf8")) as T;
      return o.usable(r) ? r : null;
    } catch {
      return null;
    }
  }

  async function load(): Promise<Loaded> {
    const cached = await readCache();
    if (cached && Date.now() - Date.parse(cached.fetchedAt) < SIX_HOURS) return { ref: cached, origin: "cache" };
    try {
      const res = await fetch(o.url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(String(res.status));
      const ref = o.parse(await res.text());
      if (!o.usable(ref)) throw new Error(`nothing found on ${o.url}`);
      await mkdir(dirname(path()), { recursive: true });
      const tmp = path() + ".tmp";
      await writeFile(tmp, JSON.stringify(ref));
      await rename(tmp, path());
      return { ref, origin: "live" };
    } catch {
      return cached ? { ref: cached, origin: "cache", failed: true } : { ref: o.shipped, origin: "shipped", failed: true };
    }
  }

  return {
    path,
    /** Forgets the copy held in memory (tests). */
    reset() {
      mem = null;
      inflight = null;
    },
    /** The parsed page: from memory for six hours, else the app folder's copy if fresh, else the live page, else the newest copy at hand. */
    async get(): Promise<{ ref: T; origin: ReferenceOrigin }> {
      if (mem && Date.now() - mem.at < SIX_HOURS) return { ref: mem.got.ref, origin: mem.got.origin };
      inflight ??= load().finally(() => (inflight = null));
      const got = await inflight;
      // After a failed download the page is tried again a minute later, not six hours later.
      mem = { got, at: got.failed ? Date.now() - SIX_HOURS + 60_000 : Date.now() };
      return { ref: got.ref, origin: got.origin };
    },
  };
}
