import chokidar from "chokidar";
import { watch } from "node:fs";
import { join, relative, sep } from "node:path";
import { emit, type Area } from "../events";
import { claudeDir, isInside } from "./paths";

// Folders under ~/.claude that change constantly and that no view depends on.
const NOISY = /^(file-history|session-env|shell-snapshots|paste-cache|debug|telemetry|statsig|cache|backups|daemon|ide|plugins\/(cache|marketplaces|data|store|\.trash)|jobs\/[^/]+\/tmp|projects\/[^/]+\/[^/]+\/(tool-results|subagents))(\/|$)/;
const HEAVY_DIR = /(^|\/)(node_modules|\.git|\.venv|\.build|\.next|dist|build|target|__pycache__|\.pytest_cache|\.ruff_cache|\.swiftpm|worktrees)(\/|$)/;

function areaOf(abs: string): Area | null {
  const cd = claudeDir();
  if (!isInside(abs, cd)) return "projects";
  const rel = relative(cd, abs).split(sep).join("/");
  if (/^projects\/[^/]+\/memory\//.test(rel) || /^agent-memory\//.test(rel)) return "memory";
  if (/^projects\//.test(rel)) return "sessions";
  if (/^(jobs|sessions)\//.test(rel)) return "jobs";
  if (/^(settings(\.local)?\.json|keybindings\.json)$/.test(rel) || /^themes\//.test(rel)) return "settings";
  if (/^(commands|skills|agents|rules|output-styles|hooks|plans|plugins)\b/.test(rel) || rel === "CLAUDE.md") return "library";
  return null;
}

type Closable = { close(): unknown };
let watchers: Closable[] = [];
const pending = new Map<Area, Set<string>>();
let timer: ReturnType<typeof setTimeout> | null = null;
let onFlush: (areas: Map<Area, Set<string>>) => void = () => {};

function queue(abs: string) {
  const area = areaOf(abs);
  if (!area) return;
  if (!pending.has(area)) pending.set(area, new Set());
  pending.get(area)!.add(abs);
  if (timer) return;
  // Claude Code appends to transcripts many times a second; batch changes.
  timer = setTimeout(() => {
    timer = null;
    const batch = new Map(pending);
    pending.clear();
    onFlush(batch);
    for (const [area, paths] of batch) emit({ area, data: { count: paths.size } });
  }, 400);
}

function ignored(p: string, cd: string) {
  if (isInside(p, cd)) {
    const rel = relative(cd, p).split(sep).join("/");
    return NOISY.test(rel) || /\.key$/.test(rel);
  }
  return HEAVY_DIR.test(p.split(sep).join("/"));
}

/**
 * One recursive OS watcher per folder (FSEvents on macOS): chokidar's one watcher per file took 22 s and
 * stalled the server for seconds at a time with ~3,000 paths. Where recursive watching isn't supported,
 * that folder falls back to chokidar.
 */
function watchFolder(dir: string, cd: string): Closable {
  try {
    const w = watch(dir, { recursive: true }, (_ev, name) => {
      const p = name ? join(dir, name.toString()) : dir; // no name: something in the folder itself changed
      if (!ignored(p, cd)) queue(p);
    });
    w.on("error", () => {}); // a folder that disappears or can't be read shouldn't stop the app
    return w;
  } catch {
    const w = chokidar.watch(dir, { ignoreInitial: true, depth: 6, ignored: (p: string) => ignored(p, cd) });
    w.on("all", (_ev, p) => queue(p));
    w.on("error", () => {});
    return w;
  }
}

export function startWatching(projectDirs: string[], flush: (areas: Map<Area, Set<string>>) => void) {
  onFlush = flush;
  const cd = claudeDir();
  for (const w of watchers) void w.close();
  watchers = [cd, ...projectDirs].map((dir) => watchFolder(dir, cd));
}

export async function stopWatching() {
  await Promise.all(watchers.map((w) => w.close()));
  watchers = [];
}
