import { basename, join } from "node:path";
import { claudeDir, tildify } from "../fs/paths";
import { classify, type Access } from "../fs/policy";
import { hooksIn } from "./hooks";
import { firstLine, isDir, ls, mtimeOf, readJson, readMd } from "./md";

export type Kind = "skill" | "agent" | "command" | "rule" | "output-style" | "hook" | "hook-def" | "settings" | "claude-md" | "plan" | "memory" | "plugin" | "mcp" | "scheduled-task" | "workflow";

export interface LibraryItem {
  kind: Kind;
  name: string;
  description: string;
  path: string; // absolute; the file to open (SKILL.md for skills)
  display: string; // ~/… path
  folder: string | null; // the skill folder, for archive/delete
  source: "user" | "project" | "plugin" | "synced";
  sourceName: string | null; // project or plugin name
  access: Access;
  state: "on" | "off" | "name-only" | "user-invocable-only" | null;
  overrideKey: string | null; // skillOverrides key, or enabledPlugins key for plugins
  mtime: number | null;
  error: string | null;
  meta: Record<string, unknown>;
  line?: number; // for hooks: where the hook sits inside its settings file
}

interface Scope {
  base: string; // a .claude directory or a plugin install path
  source: LibraryItem["source"];
  sourceName: string | null;
  skillPrefix: string;
}

const item = async (p: Partial<LibraryItem> & Pick<LibraryItem, "kind" | "name" | "path" | "source">): Promise<LibraryItem> => ({
  description: "",
  folder: null,
  sourceName: null,
  state: null,
  overrideKey: null,
  error: null,
  meta: {},
  ...p,
  display: tildify(p.path),
  access: classify(p.path),
  mtime: await mtimeOf(p.path),
});

async function mdItems(dir: string, kind: Kind, scope: Scope): Promise<LibraryItem[]> {
  const out: LibraryItem[] = [];
  for (const f of await ls(dir)) {
    const p = join(dir, f);
    if (await isDir(p)) {
      // Commands may be grouped in subfolders: /group:name.
      if (kind === "command") for (const sub of await mdItems(p, kind, scope)) out.push({ ...sub, name: `${f}:${sub.name}` });
      continue;
    }
    if (!f.endsWith(".md")) continue;
    const md = await readMd(p);
    out.push(
      await item({
        kind,
        name: md?.data.name ?? f.replace(/\.md$/, ""),
        description: String(md?.data.description ?? firstLine(md?.body)),
        path: p,
        source: scope.source,
        sourceName: scope.sourceName,
        error: md?.error ?? null,
        meta: md?.data ?? {},
      }),
    );
  }
  return out;
}

async function skillItems(dir: string, scope: Scope, overrides: Record<string, string>): Promise<LibraryItem[]> {
  const out: LibraryItem[] = [];
  for (const f of await ls(dir)) {
    const folder = join(dir, f);
    const p = join(folder, "SKILL.md");
    const md = await readMd(p);
    if (!md) continue;
    const name = String(md.data.name ?? f);
    const key = scope.skillPrefix + name;
    out.push(
      await item({
        kind: "skill",
        name,
        description: String(md.data.description ?? ""),
        path: p,
        folder,
        source: scope.source,
        sourceName: scope.sourceName,
        // Plugin skills are managed with the plugin, not skillOverrides.
        state: scope.source === "plugin" ? null : ((overrides[key] as LibraryItem["state"]) ?? "on"),
        overrideKey: scope.source === "plugin" ? null : key,
        error: md.error,
        meta: { ...md.data, files: (await ls(folder)).length },
      }),
    );
  }
  return out;
}

async function scopeItems(scope: Scope, overrides: Record<string, string>) {
  return [
    ...(await skillItems(join(scope.base, "skills"), scope, overrides)),
    ...(await mdItems(join(scope.base, "agents"), "agent", scope)),
    ...(await mdItems(join(scope.base, "commands"), "command", scope)),
    ...(await mdItems(join(scope.base, "rules"), "rule", scope)),
    ...(await mdItems(join(scope.base, "output-styles"), "output-style", scope)),
  ];
}

export interface PluginInfo {
  key: string; // name@marketplace
  name: string;
  marketplace: string;
  version: string | null;
  installPath: string;
  enabled: boolean;
  description: string;
}

export async function listPlugins(enabled: Record<string, boolean>): Promise<PluginInfo[]> {
  const inst = await readJson<{ plugins?: Record<string, { installPath: string; version?: string }[]> }>(
    join(claudeDir(), "plugins", "installed_plugins.json"),
  );
  const out: PluginInfo[] = [];
  for (const [key, versions] of Object.entries(inst?.plugins ?? {})) {
    const v = versions[versions.length - 1];
    if (!v) continue;
    const manifest = await readJson<{ description?: string; version?: string }>(join(v.installPath, ".claude-plugin", "plugin.json"));
    const [name, marketplace] = key.split("@");
    out.push({
      key,
      name,
      marketplace,
      version: v.version ?? manifest?.version ?? null,
      installPath: v.installPath,
      enabled: enabled[key] === true,
      description: manifest?.description ?? "",
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function syncedSkills(overrides: Record<string, string>): Promise<LibraryItem[]> {
  const root = join(claudeDir(), "skills", "synced");
  const out: LibraryItem[] = [];
  for (const bucket of await ls(root)) {
    out.push(...(await skillItems(join(root, bucket), { base: root, source: "synced", sourceName: "claude.ai", skillPrefix: "anthropic-skills:" }, overrides)));
  }
  return out;
}

/** Global library: ~/.claude plus installed plugins and synced skills. */
export async function globalLibrary(): Promise<{ items: LibraryItem[]; plugins: PluginInfo[] }> {
  const cd = claudeDir();
  const settings = (await readJson<Record<string, any>>(join(cd, "settings.json"))) ?? {};
  const overrides: Record<string, string> = settings.skillOverrides ?? {};
  const plugins = await listPlugins(settings.enabledPlugins ?? {});
  const items: LibraryItem[] = [];

  items.push(...(await scopeItems({ base: cd, source: "user", sourceName: null, skillPrefix: "" }, overrides)));
  items.push(...(await syncedSkills(overrides)));
  for (const p of plugins) {
    const its = await scopeItems({ base: p.installPath, source: "plugin", sourceName: p.name, skillPrefix: `${p.name}:` }, overrides);
    items.push(...its.map((i) => ({ ...i, state: p.enabled ? ("on" as const) : ("off" as const), meta: { ...i.meta, plugin: p.key } })));
  }
  for (const p of plugins) {
    items.push(
      await item({
        kind: "plugin",
        name: p.name,
        description: p.description,
        path: join(p.installPath, ".claude-plugin", "plugin.json"),
        source: "plugin",
        sourceName: p.marketplace,
        state: p.enabled ? "on" : "off",
        overrideKey: p.key,
        meta: { version: p.version, marketplace: p.marketplace },
      }),
    );
  }
  items.push(...(await planItems()));
  items.push(...(await memoryItems()));
  if (await Bun.file(join(cd, "CLAUDE.md")).exists()) {
    items.push(await item({ kind: "claude-md", name: "CLAUDE.md (all projects)", path: join(cd, "CLAUDE.md"), source: "user" }));
  }
  items.push(...(await hookScripts(join(cd, "hooks"), "user", null)));
  items.push(...(await hookDefs([join(cd, "settings.json"), join(cd, "settings.local.json")], "user", null)));
  for (const [f, description] of [
    ["settings.json", "Your settings for every project"],
    ["settings.local.json", "Your personal settings for every project, not shared"],
    ["keybindings.json", "Your keyboard shortcuts in Claude Code"],
  ] as const) {
    const p = join(cd, f);
    if (await Bun.file(p).exists()) items.push(await item({ kind: "settings", name: f, description, path: p, source: "user" }));
  }
  return { items, plugins };
}

/** Library for one project: its .claude folder and its CLAUDE.md files. */
export async function projectLibrary(dir: string): Promise<LibraryItem[]> {
  const base = join(dir, ".claude");
  const local = (await readJson<Record<string, any>>(join(base, "settings.local.json"))) ?? {};
  const shared = (await readJson<Record<string, any>>(join(base, "settings.json"))) ?? {};
  const overrides = { ...(shared.skillOverrides ?? {}), ...(local.skillOverrides ?? {}) };
  const name = basename(dir);
  const items = await scopeItems({ base, source: "project", sourceName: name, skillPrefix: "" }, overrides);
  for (const f of ["CLAUDE.md", "CLAUDE.local.md", join(".claude", "CLAUDE.md")]) {
    const p = join(dir, f);
    if (await Bun.file(p).exists()) items.push(await item({ kind: "claude-md", name: f.replace(/\\/g, "/"), path: p, source: "project", sourceName: name }));
  }
  items.push(...(await hookScripts(join(base, "hooks"), "project", name)));
  const settingsFiles = [join(base, "settings.json"), join(base, "settings.local.json")];
  for (const p of settingsFiles) {
    if (!(await Bun.file(p).exists())) continue;
    const shared = !p.endsWith(".local.json");
    items.push(
      await item({
        kind: "settings",
        name: basename(p),
        description: shared ? "Project settings, shared through the repository" : "Your settings for this project only, not shared",
        path: p,
        source: "project",
        sourceName: name,
      }),
    );
  }
  items.push(...(await hookDefs(settingsFiles, "project", name)));
  return items;
}

/** One item per hook defined in the given settings files; opening it jumps to the hook's line. */
async function hookDefs(files: string[], source: LibraryItem["source"], sourceName: string | null) {
  const out: LibraryItem[] = [];
  for (const f of files) {
    for (const h of await hooksIn(f)) {
      out.push(
        await item({
          kind: "hook-def",
          name: h.matcher ? `${h.event} · ${h.matcher}` : h.event,
          description: h.run,
          path: f,
          source,
          sourceName,
          line: h.line,
          meta: { event: h.event, matcher: h.matcher, type: h.type, timeout: h.timeout, if: h.condition, file: basename(f), group: h.group, index: h.index },
        }),
      );
    }
  }
  return out;
}

async function hookScripts(dir: string, source: LibraryItem["source"], sourceName: string | null) {
  const out: LibraryItem[] = [];
  for (const f of await ls(dir)) {
    const p = join(dir, f);
    if (await isDir(p)) continue;
    out.push(await item({ kind: "hook", name: f, description: "Hook script", path: p, source, sourceName }));
  }
  return out;
}

export async function planItems(): Promise<LibraryItem[]> {
  const dir = join(claudeDir(), "plans");
  const out: LibraryItem[] = [];
  for (const f of await ls(dir)) {
    if (!f.endsWith(".md")) continue;
    const p = join(dir, f);
    const md = await readMd(p);
    out.push(await item({ kind: "plan", name: firstLine(md?.body) || f, description: f, path: p, source: "user" }));
  }
  return out.sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
}

export async function memoryItems(): Promise<LibraryItem[]> {
  const root = join(claudeDir(), "projects");
  const out: LibraryItem[] = [];
  for (const proj of await ls(root)) {
    const dir = join(root, proj, "memory");
    for (const f of await ls(dir)) {
      if (!f.endsWith(".md")) continue;
      const p = join(dir, f);
      const md = await readMd(p);
      out.push(
        await item({
          kind: "memory",
          name: f === "MEMORY.md" ? "MEMORY.md (index)" : String(md?.data.name ?? f.replace(/\.md$/, "")),
          description: String(md?.data.description ?? ""),
          path: p,
          source: "user",
          sourceName: proj,
          error: md?.error ?? null,
          meta: { ...(md?.data ?? {}), folder: proj },
        }),
      );
    }
  }
  return out;
}
