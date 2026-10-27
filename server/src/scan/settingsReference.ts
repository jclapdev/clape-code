// The settings reference, fetched live (like the Guides pages), kept parsed in the app folder, with the
// copy shipped in the repo (scripts/settings-reference.ts) for when the computer is offline.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { appDir } from "../fs/paths";
import { parseSettingsReference, REFERENCE_URL, type SettingsReference } from "../parsers/settingsReference";
import shipped from "../data/settings-reference.json";

const SIX_HOURS = 6 * 3600_000;
export const referenceCachePath = () => join(appDir(), "settings-reference.json");

export type ReferenceOrigin = "live" | "cache" | "shipped";

type Loaded = { ref: SettingsReference; origin: ReferenceOrigin; failed?: boolean };
let mem: { at: number; got: Loaded } | null = null;
let inflight: Promise<Loaded> | null = null;

/** Forgets the copy held in memory (tests). */
export function resetSettingsReference() {
  mem = null;
  inflight = null;
}

async function readCache(): Promise<SettingsReference | null> {
  try {
    const r = JSON.parse(await readFile(referenceCachePath(), "utf8")) as SettingsReference;
    return Array.isArray(r.topics) && r.topics.length ? r : null;
  } catch {
    return null;
  }
}

async function load(): Promise<Loaded> {
  const cached = await readCache();
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < SIX_HOURS) return { ref: cached, origin: "cache" };
  try {
    const res = await fetch(REFERENCE_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(String(res.status));
    const ref = parseSettingsReference(await res.text());
    if (!ref.topics.length) throw new Error("no settings on the page");
    await mkdir(dirname(referenceCachePath()), { recursive: true });
    const tmp = referenceCachePath() + ".tmp";
    await writeFile(tmp, JSON.stringify(ref));
    await rename(tmp, referenceCachePath());
    return { ref, origin: "live" };
  } catch {
    return cached ? { ref: cached, origin: "cache", failed: true } : { ref: shipped as SettingsReference, origin: "shipped", failed: true };
  }
}

/** The parsed reference: from memory for six hours, else the app folder's copy if fresh, else the live page, else the newest copy at hand. */
export async function settingsReference(): Promise<{ ref: SettingsReference; origin: ReferenceOrigin }> {
  if (mem && Date.now() - mem.at < SIX_HOURS) return { ref: mem.got.ref, origin: mem.got.origin };
  inflight ??= load().finally(() => (inflight = null));
  const got = await inflight;
  // After a failed download the page is tried again a minute later, not six hours later.
  mem = { got, at: got.failed ? Date.now() - SIX_HOURS + 60_000 : Date.now() };
  return { ref: got.ref, origin: got.origin };
}
