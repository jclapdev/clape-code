import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Area } from "../src/events";

let root: string;
let claude: string;
let proj: string;
const seen: Map<Area, Set<string>>[] = [];

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cc-watch-"));
  claude = join(root, ".claude");
  proj = join(root, "projects", "demo");
  process.env.CC_HOME = root;
  process.env.CC_CLAUDE_DIR = claude;
  for (const d of [join(claude, "plugins", "cache"), join(claude, "commands"), join(proj, "node_modules", "pkg"), join(proj, "src")]) await mkdir(d, { recursive: true });
  const { startWatching } = await import("../src/fs/watch");
  startWatching([proj], (areas) => void seen.push(areas));
  await Bun.sleep(300); // let the OS watchers attach
});
afterAll(async () => {
  const { stopWatching } = await import("../src/fs/watch");
  await stopWatching();
  await rm(root, { recursive: true, force: true });
});

/** Writes the files, waits past the 400 ms batch and returns every path reported per area. */
async function changes(...files: string[]) {
  seen.length = 0;
  for (const f of files) await writeFile(f, String(Date.now()));
  await Bun.sleep(1200);
  const out = new Map<Area, string[]>();
  for (const batch of seen) for (const [area, paths] of batch) out.set(area, [...(out.get(area) ?? []), ...paths]);
  return out;
}

test("a write under a project or ~/.claude reports its area", async () => {
  const got = await changes(join(proj, "src", "a.ts"), join(claude, "settings.json"), join(claude, "commands", "hi.md"));
  expect(got.get("projects")).toContain(join(proj, "src", "a.ts"));
  expect(got.get("settings")).toContain(join(claude, "settings.json"));
  expect(got.get("library")).toContain(join(claude, "commands", "hi.md"));
});

test("writes under node_modules, noisy ~/.claude folders and .key files are ignored", async () => {
  const got = await changes(join(proj, "node_modules", "pkg", "index.js"), join(claude, "plugins", "cache", "p.json"), join(claude, "commands", "x.key"));
  expect([...got.values()].flat()).toEqual([]);
});
