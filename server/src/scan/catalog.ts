// Everything Claude Code can be customized with, across your home folder, every project and every plugin,
// in one list. Each item says where it applies, so a feature page can show all of them and filter by project.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { claudeDir, claudeJson, tildify, untildify } from "../fs/paths";
import { classify } from "../fs/policy";
import { listSessions } from "../db/index";
import { globalLibrary, planItem, pluginsOnInProject, projectLibrary, type LibraryItem, type PluginInfo } from "./library";
import { firstLine, ls, mtimeOf, readJson, readMd } from "./md";
import { linkPlan, planFiles } from "./plans";
import { listProjects } from "./projects";

export interface CatalogItem extends LibraryItem {
  projectId: string | null; // the project it applies to; null when it applies everywhere
  projectName: string | null;
}

export interface Catalog {
  items: CatalogItem[];
  plugins: PluginInfo[];
  projects: { id: string; name: string }[];
}

const base = async (p: Omit<LibraryItem, "display" | "access" | "mtime" | "description" | "folder" | "state" | "overrideKey" | "error" | "meta"> & Partial<LibraryItem>): Promise<LibraryItem> => ({
  description: "",
  folder: null,
  state: null,
  overrideKey: null,
  error: null,
  meta: {},
  ...p,
  display: tildify(p.path),
  access: classify(p.path),
  mtime: await mtimeOf(p.path),
});

/** How an MCP server runs, without its environment or headers, which can hold keys. */
export function mcpSummary(s: any): { type: string; runs: string } {
  return {
    type: String(s?.type ?? (s?.url ? "http" : "stdio")),
    runs: s?.url
      ? String(s.url).split("?")[0]
      : [s?.command, ...(Array.isArray(s?.args) ? s.args : []).filter((a: unknown) => typeof a === "string" && !/key|token|secret|passw|=/i.test(a))].filter(Boolean).join(" "),
  };
}

async function mcpItems(servers: Record<string, any> | undefined, path: string, scope: "user" | "local" | "project" | "plugin", source: LibraryItem["source"], sourceName: string | null) {
  const out: LibraryItem[] = [];
  for (const [name, s] of Object.entries(servers ?? {})) {
    const { type, runs } = mcpSummary(s);
    out.push(await base({ kind: "mcp", name, description: runs, path, source, sourceName, meta: { scope, type, runs } }));
  }
  return out;
}

/** The `meta` block at the top of a saved workflow script: `export const meta = { name: '…', description: '…' }`. */
export function workflowMeta(text: string): { name: string | null; description: string | null } {
  const block = text.match(/export\s+const\s+meta\s*=\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const field = (k: string) => block.match(new RegExp(`\\b${k}\\s*:\\s*(['"\`])([\\s\\S]*?)\\1`))?.[2] ?? null;
  return { name: field("name"), description: field("description") };
}

async function workflowItems(dir: string, source: LibraryItem["source"], sourceName: string | null) {
  const out: LibraryItem[] = [];
  for (const f of await ls(dir)) {
    if (!f.endsWith(".js")) continue;
    const p = join(dir, f);
    const meta = workflowMeta(await readFile(p, "utf8").catch(() => ""));
    const name = meta.name ?? f.replace(/\.js$/, "");
    out.push(await base({ kind: "workflow", name, description: meta.description ?? "", path: p, source, sourceName, meta: { command: `/${source === "plugin" ? `${sourceName}:` : ""}${name}` } }));
  }
  return out;
}

/** The Desktop app's local scheduled tasks: ~/.claude/scheduled-tasks/<name>/SKILL.md holds the name, description and prompt. */
export async function scheduledTasks() {
  const root = join(claudeDir(), "scheduled-tasks");
  const out: LibraryItem[] = [];
  for (const f of await ls(root)) {
    const p = join(root, f, "SKILL.md");
    const md = await readMd(p);
    if (!md) continue;
    out.push(await base({ kind: "scheduled-task", name: String(md.data.name ?? f), description: String(md.data.description ?? firstLine(md.body)), path: p, folder: join(root, f), source: "user", sourceName: null, error: md.error, meta: md.data }));
  }
  return out;
}

const SKIP = new Set(["settings"]); // settings files have their own page

export async function catalog(): Promise<Catalog> {
  const { items: globalItems, plugins } = await globalLibrary();
  const projects = await listProjects();
  const dirs = projects.map((p) => ({ id: p.id, name: p.name, dir: untildify(p.id) }));
  const encOf = (dir: string) => dir.replace(/[^A-Za-z0-9]/g, "-");
  const tag = (i: LibraryItem, project: { id: string; name: string } | null): CatalogItem => ({ ...i, projectId: project?.id ?? null, projectName: project?.name ?? null });

  const items: CatalogItem[] = [];
  for (const i of globalItems) {
    if (SKIP.has(i.kind) || i.kind === "plan") continue;
    // Auto memory notes live under ~/.claude but each belongs to one project folder. Agent memory there applies everywhere.
    if (i.kind === "memory" && !i.meta.agent) {
      const p = dirs.find((d) => i.sourceName === encOf(d.dir) || i.sourceName?.startsWith(`${encOf(d.dir)}--claude-worktrees-`));
      items.push(tag(i, p ?? null));
      continue;
    }
    items.push(tag(i, null));
  }

  // MCP servers in ~/.claude.json: only the server definitions are read, never the account fields beside them.
  const cj = (await readJson<{ mcpServers?: Record<string, any>; projects?: Record<string, { mcpServers?: Record<string, any> }> }>(claudeJson())) ?? {};
  for (const i of await mcpItems(cj.mcpServers, claudeJson(), "user", "user", null)) items.push(tag(i, null));
  for (const pl of plugins) {
    const file = join(pl.installPath, ".mcp.json");
    const inFile = (await readJson<{ mcpServers?: Record<string, any> }>(file))?.mcpServers ?? (await readJson<Record<string, any>>(file));
    const inManifest = (await readJson<{ mcpServers?: Record<string, any> }>(join(pl.installPath, ".claude-plugin", "plugin.json")))?.mcpServers;
    const servers = inManifest && typeof inManifest === "object" ? inManifest : inFile;
    for (const i of await mcpItems(servers ?? undefined, file, "plugin", "plugin", pl.name)) items.push(tag({ ...i, state: pl.enabled ? "on" : "off" }, null));
    for (const i of await workflowItems(join(pl.installPath, "workflows"), "plugin", pl.name)) items.push(tag(i, null));
  }
  for (const i of await workflowItems(join(claudeDir(), "workflows"), "user", null)) items.push(tag(i, null));
  for (const i of await scheduledTasks()) items.push(tag(i, null));

  // Plans: tagged with the project their conversations ran in, or the project whose plans folder holds them.
  const sessions = listSessions();
  for (const f of await planFiles(dirs)) {
    const link = linkPlan(f.path, sessions, dirs);
    const project = f.project ?? link.project;
    const meta = { status: link.status, conversations: link.conversations };
    items.push(tag(await planItem(f.path, f.project ? "project" : "user", f.project?.name ?? null, meta), project ? { id: project.id, name: project.name } : null));
  }

  for (const d of dirs) {
    const project = { id: d.id, name: d.name };
    for (const i of await projectLibrary(d.dir)) if (!SKIP.has(i.kind)) items.push(tag(i, project));
    const mcpFile = join(d.dir, ".mcp.json");
    for (const i of await mcpItems((await readJson<{ mcpServers?: Record<string, any> }>(mcpFile))?.mcpServers, mcpFile, "project", "project", d.name)) items.push(tag(i, project));
    for (const i of await mcpItems(cj.projects?.[d.dir]?.mcpServers, claudeJson(), "local", "project", d.name)) items.push(tag({ ...i, meta: { ...i.meta, local: true } }, project));
    for (const i of await workflowItems(join(d.dir, ".claude", "workflows"), "project", d.name)) items.push(tag(i, project));
  }

  // A plugin off in your settings for every project can be on in some projects: those items say where (#122).
  const onIn = new Map<string, string[]>();
  for (const d of dirs) for (const key of await pluginsOnInProject(d.dir, plugins.filter((p) => !p.enabled))) onIn.set(key, [...(onIn.get(key) ?? []), d.name]);
  for (const i of items) {
    const key = i.kind === "plugin" ? i.overrideKey : i.source === "plugin" ? (i.meta.plugin as string | undefined) ?? plugins.find((p) => p.name === i.sourceName)?.key : null;
    const where = key && i.state === "off" ? onIn.get(key) : undefined;
    if (where) i.meta = { ...i.meta, onIn: where };
  }

  return { items, plugins, projects: dirs.map(({ id, name }) => ({ id, name })) };
}

