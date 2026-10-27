import { readdir, readFile } from "node:fs/promises";
import { basename, join, sep } from "node:path";
import { getConfig } from "../config";
import { listSessions } from "../db/index";
import { isInside, tildify, untildify } from "../fs/paths";
import { setProjectDirs } from "../fs/policy";
import { countBacklog } from "../parsers/backlog";
import { isDir, ls } from "./md";

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

/** The project's handoff note: PROGRESS.md (Done / In progress / Next / Notes), or an older BACKLOG.md. */
export function handoffName(entries: string[]): "PROGRESS.md" | "BACKLOG.md" | null {
  return entries.includes("PROGRESS.md") ? "PROGRESS.md" : entries.includes("BACKLOG.md") ? "BACKLOG.md" : null;
}

async function backlogCounts(dir: string, entries: string[]) {
  const read = (f: string | null) => (f && entries.includes(f) ? readFile(join(dir, f), "utf8").catch(() => null) : Promise.resolve(null));
  return countBacklog(await read("BACKLOG.md"), await read(handoffName(entries)));
}

/**
 * The folders inside the Project folders set in Preferences. No other folder on the computer is looked at (BRIEF.md
 * won't-do, S10): folders named in transcripts or ~/.claude.json set off macOS prompts for Documents, iCloud Drive
 * and Mail.
 */
export async function discoverProjectDirs(): Promise<string[]> {
  const cfg = await getConfig();
  const out: string[] = [];
  for (const r of cfg.projectRoots.map(untildify)) {
    for (const n of await ls(r)) {
      const p = join(r, n);
      if (!out.includes(p) && (await isDir(p))) out.push(p);
    }
  }
  return out;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const sessions = listSessions();
  const dirs = await discoverProjectDirs();
  setProjectDirs(dirs);

  return Promise.all(
    dirs.map(async (dir) => {
      const entries = await readdir(dir).catch(() => [] as string[]);
      const mine = sessions.filter((s) => s.cwd && isInside(projectPathOf(s.cwd), dir));
      return {
        id: tildify(dir),
        name: basename(dir),
        path: tildify(dir),
        empty: entries.filter((e) => e !== ".DS_Store").length === 0,
        hasClaudeDir: entries.includes(".claude"),
        isPlugin: entries.includes(".claude-plugin"),
        docs: entries.filter((e) => /\.md$/i.test(e)).sort(),
        backlog: await backlogCounts(dir, entries),
        sessions: mine.length,
        lastSessionAt: mine[0]?.lastAt ?? null,
        git: await gitInfo(dir),
      } satisfies ProjectSummary;
    }),
  ).then((list) =>
    list.sort((a, b) => (b.lastSessionAt ?? "").localeCompare(a.lastSessionAt ?? "") || a.name.localeCompare(b.name)),
  );
}

/** Resolve a project id from the browser to its folder, refusing anything not discovered. */
export async function projectDir(id: string): Promise<string | null> {
  const abs = untildify(id);
  return (await discoverProjectDirs()).find((d) => d === abs) ?? null;
}
