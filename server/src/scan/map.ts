import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { listSessions } from "../db/index";
import { claudeDir, claudeJson, isInside, tildify } from "../fs/paths";
import { classify, type Access } from "../fs/policy";
import { isDir, ls } from "./md";

export interface MapEntry {
  path: string; // ~/… display path; may contain a * pattern
  what: string;
  format: string;
  count: number | null;
  access: Access;
  link: string | null; // app route
  exists: boolean;
}

export interface MapGroup {
  name: string;
  entries: MapEntry[];
}

export function managedSettingsPath(): string {
  if (process.platform === "darwin") return "/Library/Application Support/ClaudeCode/managed-settings.json";
  if (process.platform === "win32") return "C:\\Program Files\\ClaudeCode\\managed-settings.json";
  return "/etc/claude-code/managed-settings.json";
}

type Def = [rel: string, what: string, format: string, link: string | null, count?: "dir" | "file" | "lines" | "md" | "skills" | "synced" | number];

const GLOBAL: Def[] = [
  ["settings.json", "Your settings for every project: model, permissions, hooks, plugins", "JSON", "/settings", "file"],
  ["settings.local.json", "Personal settings for every project, not shared", "JSON", "/settings", "file"],
  ["CLAUDE.md", "Instructions Claude reads in every project", "Markdown", "/library?kind=claude-md", "file"],
  ["keybindings.json", "Keyboard shortcuts", "JSON", null, "file"],
  ["commands", "Slash commands", "Markdown + frontmatter", "/library?kind=command", "md"],
  ["skills", "Your skills (one folder each, with SKILL.md)", "Folders", "/library?kind=skill", "skills"],
  ["agents", "Your subagents", "Markdown + frontmatter", "/library?kind=agent", "md"],
  ["rules", "Rules that apply to matching paths", "Markdown + frontmatter", "/library?kind=rule", "md"],
  ["output-styles", "Output styles", "Markdown + frontmatter", "/library?kind=output-style", "md"],
  ["hooks", "Scripts your hooks run", "Scripts", "/library?kind=hook", "dir"],
  ["plans", "Plans written in plan mode", "Markdown", "/library?kind=plan", "md"],
  ["skills/synced", "Skills synced from claude.ai", "Folders", "/library?kind=skill", "synced"],
  ["history.jsonl", "Every prompt you typed, newest last", "JSON lines", null, "lines"],
  ["jobs", "Background jobs and their timelines", "JSON", "/jobs", "dir"],
  ["sessions", "Claude Code processes running now", "JSON", "/jobs", "dir"],
  ["tasks", "Task lists for running sessions", "Folders", null, "dir"],
  ["file-history", "Earlier versions of files Claude edited", "Raw file copies", null, "dir"],
  ["plugins/installed_plugins.json", "Installed plugins and where they live", "JSON", "/library?kind=plugin", "file"],
  ["plugins/known_marketplaces.json", "Plugin marketplaces you added", "JSON", "/library?kind=plugin", "file"],
  ["plugins/cache", "Downloaded plugin files, one folder per version", "Folders", null, "dir"],
  ["stats-cache.json", "Usage totals computed by Claude Code", "JSON", null, "file"],
  ["cache", "Release notes, model catalog and other caches", "Mixed", null, "dir"],
  ["telemetry", "Usage events that failed to upload", "JSON", null, "dir"],
  ["feedback", "Feedback drafts", "JSON", null, "dir"],
  ["sessions/*.key", "Tokens for running sessions", "—", null],
  ["daemon", "Background service state and its auth files", "—", null],
  ["shell-snapshots", "Copies of your shell environment", "—", null],
  ["backups", "Claude Code's copies of ~/.claude.json, with account details", "—", null],
  ["paste-cache", "Text you pasted into prompts", "—", null],
];

const PROJECT: Def[] = [
  ["CLAUDE.md", "Project instructions, shared in git", "Markdown", "library", "file"],
  ["CLAUDE.local.md", "Your own project instructions, not shared", "Markdown", "library", "file"],
  [".claude/settings.json", "Project settings and hooks, shared in git", "JSON", "/settings", "file"],
  [".claude/settings.local.json", "Your settings for this project only", "JSON", "/settings", "file"],
  [".claude/agents", "Project subagents", "Markdown + frontmatter", "library", "md"],
  [".claude/skills", "Project skills", "Folders", "library", "dir"],
  [".claude/commands", "Project slash commands", "Markdown + frontmatter", "library", "md"],
  [".claude/rules", "Project rules", "Markdown + frontmatter", "library", "md"],
  [".claude/hooks", "Scripts the project's hooks run", "Scripts", "library", "dir"],
  [".claude/worktrees", "Git worktrees Claude created for isolated work", "Folders", null, "dir"],
  [".mcp.json", "MCP servers for this project", "JSON", null, "file"],
  [".claude-plugin/plugin.json", "This project is a Claude Code plugin", "JSON", null, "file"],
  [".worktreeinclude", "Files copied into new worktrees", "Text", null, "file"],
  ["BACKLOG.md", "What is left to do", "Markdown", "backlog", "file"],
  ["CHANGELOG.md", "What changed, newest first", "Markdown", "changelog", "file"],
];

async function countOf(abs: string, how: Def[4]): Promise<{ exists: boolean; count: number | null }> {
  if (how === undefined) return { exists: await Bun.file(abs).exists().then((f) => f || isDir(abs)), count: null };
  if (typeof how === "number") return { exists: true, count: how };
  if (how === "file") {
    const e = await Bun.file(abs).exists();
    return { exists: e, count: e ? 1 : 0 };
  }
  if (how === "lines") {
    try {
      return { exists: true, count: (await readFile(abs, "utf8")).split("\n").filter(Boolean).length };
    } catch {
      return { exists: false, count: 0 };
    }
  }
  if (!(await isDir(abs))) return { exists: false, count: 0 };
  const names = await ls(abs);
  if (how === "skills") return { exists: true, count: names.filter((n) => n !== "synced").length };
  if (how === "synced") {
    let n = 0;
    for (const bucket of names) n += (await ls(join(abs, bucket))).filter((x) => x !== "manifest.json").length;
    return { exists: true, count: n };
  }
  return { exists: true, count: how === "md" ? names.filter((n) => n.endsWith(".md")).length : names.length };
}

async function build(base: string, defs: Def[], linkFor: (l: string | null) => string | null): Promise<MapEntry[]> {
  return Promise.all(
    defs.map(async ([rel, what, format, link, how]) => {
      const abs = join(base, rel.replace("/*.key", ""));
      const { exists, count } = await countOf(abs, how);
      const access = rel === "sessions/*.key" ? "secret" : classify(abs);
      return { path: tildify(join(base, rel)), what, format, count: access === "secret" ? null : count, access, link: linkFor(link), exists };
    }),
  );
}

export async function buildMap(projects: { id: string; name: string; dir: string }[]): Promise<MapGroup[]> {
  const cd = claudeDir();
  const sessions = listSessions();
  const memoryFolders = (await ls(join(cd, "projects"))).filter((p) => p.startsWith("-"));
  let memCount = 0;
  for (const p of memoryFolders) if (await isDir(join(cd, "projects", p, "memory"))) memCount++;

  const global = await build(cd, GLOBAL, (l) => l);
  global.splice(11, 0,
    {
      path: tildify(join(cd, "projects", "*", "*.jsonl")),
      what: "Session transcripts, one folder per working directory",
      format: "JSON lines",
      count: sessions.length,
      access: "app",
      link: "/sessions",
      exists: true,
    },
    {
      path: tildify(join(cd, "projects", "*", "memory")),
      what: "Memory notes and their MEMORY.md index, per working directory",
      format: "Markdown + frontmatter",
      count: memCount,
      access: "edit",
      link: "/library?kind=memory",
      exists: memCount > 0,
    },
  );

  const managed = managedSettingsPath();
  const groups: MapGroup[] = [
    { name: `Global · ${tildify(cd)}`, entries: global },
    {
      name: "Elsewhere on this machine",
      entries: [
        { path: tildify(claudeJson()), what: "Per-project state and usage counts; Claude Code rewrites it often", format: "JSON", count: null, access: "app", link: null, exists: await Bun.file(claudeJson()).exists() },
        { path: managed, what: "Settings your organization manages; nothing overrides them", format: "JSON", count: null, access: "app", link: "/settings", exists: await Bun.file(managed).exists() },
      ],
    },
  ];
  for (const p of projects) {
    const entries = (await build(p.dir, PROJECT, (l) => (l === null ? null : l.startsWith("/") ? l : `/projects/${encodeURIComponent(p.id)}?tab=${l === "library" ? "config" : l}`))).filter((e) => e.exists);
    if (entries.length) groups.push({ name: `Project · ${p.id}`, entries });
  }
  return groups;
}

export { isInside };
