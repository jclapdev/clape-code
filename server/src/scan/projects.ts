import { readdir, readFile } from "node:fs/promises";
import { basename, join, sep } from "node:path";
import { getConfig } from "../config";
import { listSessions, type IndexedSession } from "../db/index";
import { claudeJson, home, isInside, tildify, untildify } from "../fs/paths";
import { setProjectDirs } from "../fs/policy";
import { parseBacklog } from "../parsers/backlog";
import { isDir, ls, readJson } from "./md";

export interface GitInfo {
  branch: string | null;
  dirty: number;
  lastCommitAt: string | null;
  remote: string | null;
}

export interface ProjectSummary {
  id: string; // tildified path, stable and readable
  name: string;
  path: string;
  group: "root" | "other";
  empty: boolean;
  hasClaudeDir: boolean;
  isPlugin: boolean;
  docs: string[]; // root-level .md files
  backlog: { open: number; done: number; total: number } | null;
  sessions: number;
  lastSessionAt: string | null;
  git: GitInfo | null;
}

async function run(cmd: string[], cwd: string): Promise<string | null> {
  try {
    const p = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "ignore" });
    const out = await new Response(p.stdout).text();
    return (await p.exited) === 0 ? out.trim() : null;
  } catch {
    return null; // git not installed
  }
}

const gitCache = new Map<string, { at: number; info: GitInfo | null }>();

export async function gitInfo(dir: string): Promise<GitInfo | null> {
  const hit = gitCache.get(dir);
  if (hit && Date.now() - hit.at < 15000) return hit.info;
  let info: GitInfo | null = null;
  if (await isDir(join(dir, ".git")).then((d) => d || Bun.file(join(dir, ".git")).exists())) {
    const [branch, status, last, remote] = await Promise.all([
      run(["git", "rev-parse", "--abbrev-ref", "HEAD"], dir),
      run(["git", "status", "--porcelain"], dir),
      run(["git", "log", "-1", "--format=%cI"], dir),
      run(["git", "remote", "get-url", "origin"], dir),
    ]);
    info = {
      branch,
      dirty: status ? status.split("\n").filter(Boolean).length : 0,
      lastCommitAt: last || null,
      remote: remote?.replace(/^git@([^:]+):/, "$1/").replace(/^https?:\/\//, "").replace(/\.git$/, "") ?? null,
    };
  }
  gitCache.set(dir, { at: Date.now(), info });
  return info;
}

/** A session started inside a worktree belongs to the project that owns the worktree. */
export function projectPathOf(cwd: string): string {
  const marker = `${sep}.claude${sep}worktrees${sep}`;
  const i = cwd.indexOf(marker);
  return i >= 0 ? cwd.slice(0, i) : cwd;
}

async function backlogCounts(dir: string) {
  try {
    const b = parseBacklog(await readFile(join(dir, "BACKLOG.md"), "utf8"));
    const items = b.sections.flatMap((s) => s.items);
    const done = items.filter((i) => i.done === true).length;
    return { open: items.length - done, done, total: items.length };
  } catch {
    return null;
  }
}

export async function discoverProjectDirs(sessions: IndexedSession[]): Promise<{ dir: string; group: "root" | "other" }[]> {
  const cfg = await getConfig();
  const out = new Map<string, "root" | "other">();
  for (const r of cfg.projectRoots.map(untildify)) {
    for (const n of await ls(r)) {
      const p = join(r, n);
      if (await isDir(p)) out.set(p, "root");
    }
  }
  const roots = cfg.projectRoots.map(untildify);
  const others = new Set<string>();
  for (const s of sessions) if (s.cwd) others.add(projectPathOf(s.cwd));
  const cj = await readJson<{ projects?: Record<string, unknown> }>(claudeJson());
  for (const p of Object.keys(cj?.projects ?? {})) others.add(projectPathOf(p));
  for (const p of others) {
    if (out.has(p) || p === home() || roots.some((r) => p === r)) continue;
    // Folders inside a known project are part of it, not projects of their own.
    if ([...out.keys()].some((k) => isInside(p, k))) continue;
    if (await isDir(p)) out.set(p, "other");
  }
  return [...out].map(([dir, group]) => ({ dir, group }));
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const sessions = listSessions();
  const dirs = await discoverProjectDirs(sessions);
  setProjectDirs(dirs.map((d) => d.dir));

  return Promise.all(
    dirs.map(async ({ dir, group }) => {
      const entries = await readdir(dir).catch(() => [] as string[]);
      const mine = sessions.filter((s) => s.cwd && isInside(projectPathOf(s.cwd), dir));
      return {
        id: tildify(dir),
        name: basename(dir),
        path: tildify(dir),
        group,
        empty: entries.filter((e) => e !== ".DS_Store").length === 0,
        hasClaudeDir: entries.includes(".claude"),
        isPlugin: entries.includes(".claude-plugin"),
        docs: entries.filter((e) => /\.md$/i.test(e)).sort(),
        backlog: entries.includes("BACKLOG.md") ? await backlogCounts(dir) : null,
        sessions: mine.length,
        lastSessionAt: mine[0]?.lastAt ?? null,
        git: await gitInfo(dir),
      } satisfies ProjectSummary;
    }),
  ).then((list) =>
    list.sort((a, b) => (a.group === b.group ? (b.lastSessionAt ?? "").localeCompare(a.lastSessionAt ?? "") || a.name.localeCompare(b.name) : a.group === "root" ? -1 : 1)),
  );
}

/** Resolve a project id from the browser to its folder, refusing anything not discovered. */
export async function projectDir(id: string): Promise<string | null> {
  const dirs = await discoverProjectDirs(listSessions());
  const abs = untildify(id);
  return dirs.find((d) => d.dir === abs)?.dir ?? null;
}
