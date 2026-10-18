import chokidar, { type FSWatcher } from "chokidar";
import { relative, sep } from "node:path";
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

let watcher: FSWatcher | null = null;
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

export function startWatching(projectDirs: string[], flush: (areas: Map<Area, Set<string>>) => void) {
  onFlush = flush;
  const cd = claudeDir();
  watcher?.close();
  watcher = chokidar.watch([cd, ...projectDirs], {
    ignoreInitial: true,
    depth: 6,
    ignored: (p: string) => {
      if (isInside(p, cd)) {
        const rel = relative(cd, p).split(sep).join("/");
        return NOISY.test(rel) || /\.key$/.test(rel);
      }
      return HEAVY_DIR.test(p.split(sep).join("/"));
    },
  });
  watcher.on("all", (_ev, p) => queue(p));
  watcher.on("error", () => {}); // permission errors on odd folders shouldn't stop the app
  return watcher;
}

export async function stopWatching() {
  await watcher?.close();
  watcher = null;
}
