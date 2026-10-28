import { Hono } from "hono";
import { cp, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { archiveEntry, archiveItem, dropArchived, listArchive, readArchived, restoreItem, trashItem, type ArchiveKind } from "../fs/archive";
import { emit } from "../events";
import { claudeDir, claudeJson, isInside, tildify, untildify } from "../fs/paths";
import { canRead, classify } from "../fs/policy";
import { readWithHash, safeWrite, WriteError } from "../fs/safeWrite";
import { addEntry, isKeepAChangelog, parseChangelog } from "../parsers/changelog";
import { effective, valueNow, type Source } from "../parsers/settings";
import { REFERENCE_URL } from "../parsers/settingsReference";
import { settingsReference } from "../scan/settingsReference";
import { applySettingsChange, redactEnv, removeKeybinding, setKeybinding, settingValue, writableIn, type SettingsChange } from "../parsers/settingsEdit";
import { setKeyInText } from "../parsers/jsonText";
import { KEY_ACTIONS, KEY_CONTEXTS } from "../parsers/keybindingDocs";
import { search as searchDocs, listSessions, untitled } from "../db/index";
import { globalLibrary, listPlugins, listThemes, pluginsOnInProject, memoryItems, projectLibrary, readKeybindings, readWorktreeInclude } from "../scan/library";
import { catalog } from "../scan/catalog";
import { initArgs, initResult, marketplaceCounts, parseAvailable, parseMarketplaces, pluginArgs, pluginResult, searchAvailable, skillsDirPlugins, type Available } from "../scan/plugins";
import { buildMap, managedSettingsPath } from "../scan/map";
import { listProjects, projectDir, projectPathOf } from "../scan/projects";
import { isDir, ls, readJson, readMd } from "../scan/md";
import type { Env } from "./env";
import { boardOf, contextOf } from "./projectWork";
import { findClaude, runClaude } from "../live/claude";
import { jsonProblem, MISSING_FILE } from "../errors";

export const content = new Hono<Env>();

const MAX_EDIT_BYTES = 2 * 1024 * 1024;

async function requireProject(id: string) {
  const dir = await projectDir(decodeURIComponent(id));
  if (!dir) throw new WriteError(404, "Unknown project.");
  return dir;
}

/** Read-modify-write a JSON settings file through safeWrite, keeping its indentation. */
async function updateJson(abs: string, mutate: (o: Record<string, any>) => void) {
  const cur = await readWithHash(abs);
  const problem = cur ? jsonProblem(cur.content) : null;
  if (problem) throw new WriteError(400, `${problem} Fix it as text first.`);
  const obj = cur ? JSON.parse(cur.content) : {};
  mutate(obj);
  const indent = cur?.content.match(/^\{\s*\n([ \t]+)/)?.[1] ?? "  ";
  return safeWrite(abs, JSON.stringify(obj, null, indent) + "\n", cur?.hash ?? null);
}

// ---- Projects ----

content.get("/projects", async (c) => c.json(await listProjects()));

content.get("/projects/:id", async (c) => {
  const dir = await requireProject(c.req.param("id"));
  const summary = (await listProjects()).find((p) => untildify(p.id) === dir)!;
  const changelogFile = await readWithHash(join(dir, "CHANGELOG.md"));
  const worktrees = (await ls(join(dir, ".claude", "worktrees"))).map((n) => ({ name: n, path: tildify(join(dir, ".claude", "worktrees", n)) }));
  const all = listSessions().filter((s) => s.cwd && isInside(projectPathOf(s.cwd), dir));
  const sessions = all
    .slice(0, 100)
    .map(({ file, ...s }) => ({ ...s, displayTitle: s.title ?? untitled(s.firstPrompt), worktree: s.cwd !== projectPathOf(s.cwd!) }));
  return c.json({
    ...summary,
    abs: dir,
    board: await boardOf(dir),
    context: await contextOf(dir),
    changelog: changelogFile ? { ...parseChangelog(changelogFile.content), keep: isKeepAChangelog(changelogFile.content), hash: changelogFile.hash, path: join(dir, "CHANGELOG.md") } : null,
    docs: summary.docs.map((d) => ({ name: d, path: join(dir, d) })),
    library: await projectLibrary(dir),
    plans: await projectPlans(all),
    memory: (await memoryItems()).filter((m) => m.sourceName && isMemoryOf(m.sourceName, dir)),
    mcpServers: await mcpServersIn(join(dir, ".mcp.json")),
    worktreeInclude: await readWorktreeInclude(dir),
    worktrees,
    sessions,
    pluginsOn: await pluginsOnIn(dir),
  });
});

/** The plugins turned on in a project, after your settings and the project's own. */
export async function pluginsOnIn(dir: string): Promise<string[]> {
  const settings = await readJson<{ enabledPlugins?: Record<string, boolean> }>(join(claudeDir(), "settings.json"));
  return pluginsOnInProject(dir, await listPlugins(settings?.enabledPlugins ?? {}));
}

/** Plans the project's sessions wrote, newest first, each with the session that wrote it. */
async function projectPlans(sessions: ReturnType<typeof listSessions>) {
  const seen = new Map<string, { path: string; title: string; sessionId: string; sessionTitle: string; at: string | null; open: string[] }>();
  for (const s of sessions) {
    for (const p of s.plans ?? []) {
      if (seen.has(p) || !canRead(p) || !(await Bun.file(p).exists())) continue;
      const md = await readMd(p);
      const body = md?.body ?? "";
      const title = body.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "").trim() || basename(p);
      // Unticked checklist lines are the plan's unfinished work; they fill Backlog when there's no BACKLOG.md.
      const open = [...body.matchAll(/^\s*[-*] \[ \] (.+)$/gm)].map((m) => m[1]!.replace(/\s+—\s+check:.*$/, "").trim());
      seen.set(p, { path: p, title, sessionId: s.sessionId, sessionTitle: s.title ?? untitled(s.firstPrompt), at: s.lastAt, open });
    }
  }
  return [...seen.values()].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
}

/** Claude Code names a memory folder after the working directory with every other character turned into "-". */
function isMemoryOf(folder: string, dir: string) {
  const enc = dir.replace(/[^A-Za-z0-9]/g, "-");
  return folder === enc || folder.startsWith(`${enc}--claude-worktrees-`);
}

/** Server names and how each runs, from an .mcp.json. Environment and headers can hold keys, so they're left out. */
async function mcpServersIn(path: string) {
  const f = await readWithHash(path).catch(() => null);
  if (!f) return { path, servers: [] };
  let parsed: any = null;
  try {
    parsed = JSON.parse(f.content);
  } catch {
    return { path, servers: [], error: jsonProblem(f.content) };
  }
  const servers = Object.entries<any>(parsed?.mcpServers ?? {}).map(([name, s]) => ({
    name,
    type: String(s?.type ?? (s?.url ? "http" : "stdio")),
    runs: s?.url
      ? String(s.url).split("?")[0]
      : [s?.command, ...(Array.isArray(s?.args) ? s.args : []).filter((a: unknown) => typeof a === "string" && !/key|token|secret|passw|=/i.test(a))]
          .filter(Boolean)
          .join(" "),
  }));
  return { path, servers };
}

async function editProjectFile(id: string, file: string, hash: string, change: (text: string) => string) {
  const dir = await requireProject(id);
  const abs = join(dir, file);
  const cur = await readWithHash(abs);
  if (!cur) throw new WriteError(404, `${file} not found.`);
  if (cur.hash !== hash) throw new WriteError(409, "The file changed on disk after you opened it.", cur);
  let next: string;
  try {
    next = change(cur.content);
  } catch (e: any) {
    throw new WriteError(400, e.message);
  }
  const r = await safeWrite(abs, next, cur.hash);
  emit({ area: "projects", path: abs });
  return r;
}

content.post("/projects/:id/changelog", async (c) => {
  const { text, hash, kind } = await c.req.json();
  return c.json(await editProjectFile(c.req.param("id"), "CHANGELOG.md", hash, (t) => addEntry(t, text, new Date(), kind)));
});

// ---- Files ----

content.get("/file", async (c) => {
  const abs = untildify(c.req.query("path") ?? "");
  if (!canRead(abs)) throw new WriteError(403, classify(abs) === "secret" ? "This file holds secrets and is never shown." : "The app can't open files here.");
  const st = await stat(abs).catch(() => null);
  if (!st) throw new WriteError(404, MISSING_FILE);
  if (st.isDirectory()) {
    const names = await readdir(abs);
    return c.json({ path: abs, display: tildify(abs), dir: true, entries: names.filter((n) => !n.startsWith(".")).sort() });
  }
  const tooBig = st.size > MAX_EDIT_BYTES;
  const f = tooBig ? null : await readWithHash(abs);
  return c.json({
    path: abs,
    display: tildify(abs),
    dir: false,
    content: f?.content ?? null,
    hash: f?.hash ?? null,
    size: st.size,
    mtime: st.mtimeMs,
    access: tooBig ? "app" : classify(abs),
    tooBig,
  });
});

content.put("/file", async (c) => {
  const { path, content: text, hash } = await c.req.json();
  const abs = untildify(path);
  const r = await safeWrite(abs, text, hash ?? null);
  return c.json(r);
});

// ---- Library ----

content.get("/library", async (c) => {
  const scope = c.req.query("scope") ?? "global";
  if (scope === "global") return c.json(await globalLibrary());
  const dir = await requireProject(scope);
  return c.json({ items: await projectLibrary(dir), plugins: [] });
});

content.post("/library/skill-state", async (c) => {
  const { key, state, scope } = await c.req.json();
  if (!["on", "off", "name-only", "user-invocable-only"].includes(state)) throw new WriteError(400, "Pick one of: on, name only, only me, or off.");
  // Matches Claude Code's /skills menu: project changes go to settings.local.json.
  const file = scope && scope !== "global" ? join(await requireProject(scope), ".claude", "settings.local.json") : join(claudeDir(), "settings.json");
  const r = await updateJson(file, (o) => {
    o.skillOverrides ??= {};
    if (state === "on") delete o.skillOverrides[key];
    else o.skillOverrides[key] = state;
    if (!Object.keys(o.skillOverrides).length) delete o.skillOverrides;
  });
  emit({ area: "library" });
  return c.json(r);
});

/** The thing to move for an item: the folder for skills and scheduled tasks, the file for everything else. */
async function itemTarget(path: string, kind: string) {
  const abs = untildify(path);
  if ((kind === "skill" || kind === "scheduled-task") && basename(abs) === "SKILL.md") return dirname(abs);
  return abs;
}

content.post("/library/archive", async (c) => {
  const { path, kind } = await c.req.json();
  const rec = await archiveItem(await itemTarget(path, kind), kind as ArchiveKind);
  emit({ area: "library" });
  emit({ area: "archive" });
  return c.json(rec);
});

content.post("/library/delete", async (c) => {
  const { path, kind } = await c.req.json();
  await trashItem(await itemTarget(path, kind));
  emit({ area: "library" });
  return c.json({ ok: true });
});

content.get("/archive", async (c) => c.json((await listArchive()).map((r) => ({ ...r, originalDisplay: tildify(r.originalPath) }))));
content.post("/archive/:id/restore", async (c) => {
  const id = c.req.param("id");
  const { rec, entry } = await readArchived(id);
  if (rec.kind === "hook") {
    await updateJson(rec.originalPath, (o) => putHookBack(o, entry));
    await dropArchived(id);
  } else if (rec.kind === "mcp") {
    await putMcpBack(entry);
    await dropArchived(id);
  } else await restoreItem(id);
  emit({ area: "library" });
  emit({ area: "archive" });
  return c.json(rec);
});

/** Run the Agent Skills reference validator on a skill folder. uvx caches the tool after the first run. */
async function runSkillsRef(dir: string) {
  const cmd = ["uvx", "--from", "git+https://github.com/agentskills/agentskills#subdirectory=skills-ref", "skills-ref", "validate", dir];
  try {
    const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => p.kill(), 180_000);
    const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
    const code = await p.exited;
    clearTimeout(timer);
    return { available: true, ok: code === 0, output: (out + "\n" + err).trim() };
  } catch {
    return { available: false, ok: false, output: "uvx is not installed, so the skill can't be validated here." };
  }
}

// ---- Create anything Claude Code reads from a file ----

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const AGENT_MODELS = ["inherit", "sonnet", "opus", "haiku", "fable"];
export const CREATABLE = ["skill", "command", "agent", "rule", "output-style", "memory", "instructions"] as const;
type NewForm = { kind: string; name?: string; description?: string; body?: string; manualOnly?: boolean; tools?: string[]; model?: string; paths?: string[]; keepCoding?: boolean };

const yamlStr = (v: string) => JSON.stringify(v.replace(/\s+/g, " ").trim());

/** The file a new item becomes, following agentskills.io for skills and Claude Code's documented formats for the rest. */
export function newItemFile(f: NewForm): string {
  const name = String(f.name ?? "").trim();
  const description = String(f.description ?? "").replace(/\s+/g, " ").trim();
  const body = String(f.body ?? "").trim();
  const needsName = f.kind !== "instructions";
  if (needsName && (!SLUG.test(name) || name.length > 64)) throw new WriteError(400, "Use a name of up to 64 lowercase letters, numbers and single hyphens, such as review-pr.");
  if (description.length > 1024) throw new WriteError(400, `The description is ${description.length} characters; keep it to 1024.`);
  const front: string[] = [];
  switch (f.kind) {
    case "skill":
    case "command":
      if (!description) throw new WriteError(400, "Describe what it does and when to use it.");
      front.push(`name: ${name}`, `description: ${yamlStr(description)}`);
      if (f.kind === "command" || f.manualOnly) front.push("disable-model-invocation: true");
      break;
    case "agent": {
      if (!description) throw new WriteError(400, "Describe when Claude should hand work to this agent.");
      front.push(`name: ${name}`, `description: ${yamlStr(description)}`);
      const tools = (f.tools ?? []).filter((t) => /^[A-Za-z]\w*$/.test(t));
      if (tools.length) front.push(`tools: ${tools.join(", ")}`);
      if (f.model && f.model !== "inherit") {
        if (!AGENT_MODELS.includes(f.model)) throw new WriteError(400, "Pick one of the listed models.");
        front.push(`model: ${f.model}`);
      }
      break;
    }
    case "rule": {
      const paths = (f.paths ?? []).map((x) => x.trim()).filter(Boolean);
      if (paths.length) front.push("paths:", ...paths.map((x) => `  - ${JSON.stringify(x)}`));
      if (!body) throw new WriteError(400, "Write the rule.");
      break;
    }
    case "output-style":
      front.push(`name: ${name}`);
      if (description) front.push(`description: ${yamlStr(description)}`);
      if (f.keepCoding) front.push("keep-coding-instructions: true");
      break;
    case "memory":
      if (!body) throw new WriteError(400, "Write the note.");
      front.push(`name: ${name}`);
      if (description) front.push(`description: ${yamlStr(description)}`);
      break;
    case "instructions":
      return `${body}\n`;
    default:
      throw new WriteError(400, `You can create: ${CREATABLE.join(", ")}.`);
  }
  const head = front.length ? `---\n${front.join("\n")}\n---\n\n` : "";
  return `${head}${body ? `${body}\n` : ""}`;
}

/** Where a new item goes. Commands are skills that only run when typed, as Claude Code now recommends. */
function newItemPath(kind: string, name: string, base: string, memDir: string) {
  switch (kind) {
    case "skill":
    case "command":
      return join(base, "skills", name, "SKILL.md");
    case "agent":
      return join(base, "agents", `${name}.md`);
    case "rule":
      return join(base, "rules", `${name}.md`);
    case "output-style":
      return join(base, "output-styles", `${name}.md`);
    case "memory":
      return join(memDir, `${name}.md`);
    default:
      return join(dirname(base), "CLAUDE.md");
  }
}

content.post("/library/new", async (c) => {
  const f = (await c.req.json()) as NewForm & { scope?: string };
  const project = f.scope && f.scope !== "global" ? await requireProject(f.scope) : null;
  const base = project ? join(project, ".claude") : claudeDir();
  if (f.kind === "memory" && !project) throw new WriteError(400, "Memory notes belong to one project. Add it from that project's page.");
  const memDir = join(claudeDir(), "projects", (project ?? "").replace(/[^A-Za-z0-9]/g, "-"), "memory");
  const text = newItemFile(f);
  const path = newItemPath(f.kind, String(f.name ?? ""), base, memDir);
  if (await Bun.file(path).exists()) throw new WriteError(409, `${tildify(path)} already exists. Pick another name, or open the existing one.`);
  await safeWrite(path, text, null);
  if (f.kind === "memory") {
    // Claude reads MEMORY.md each session; a note it doesn't list there is never seen.
    const index = join(memDir, "MEMORY.md");
    const cur = await readWithHash(index);
    const line = `- [${f.name}](${f.name}.md)${f.description ? ` — ${String(f.description).trim()}` : ""}\n`;
    await safeWrite(index, `${cur ? cur.content.replace(/\n?$/, "\n") : ""}${line}`, cur?.hash ?? null);
  }
  emit({ area: "library" });
  const check = f.kind === "skill" || f.kind === "command" ? await runSkillsRef(dirname(path)) : null;
  return c.json({ path, display: tildify(path), check });
});

// ---- Add a permission rule, hook or MCP server ----

export const HOOK_EVENTS = ["PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop", "SessionStart", "SessionEnd", "Notification", "PreCompact", "SubagentStop"];
const TOOL_EVENTS = new Set(["PreToolUse", "PostToolUse"]);

/** Adds one permission rule or hook to a settings object, leaving everything else in it as it was. */
export function addToSettings(o: Record<string, any>, f: { what: string; list?: string; rule?: string; event?: string; matcher?: string; command?: string }) {
  if (f.what === "permission") {
    const list = f.list ?? "";
    const rule = String(f.rule ?? "").trim();
    if (!["allow", "deny", "ask"].includes(list)) throw new WriteError(400, "Pick allow, ask first, or never allow.");
    if (!rule) throw new WriteError(400, "Write the rule, such as Bash(npm run test) or WebFetch(domain:github.com).");
    o.permissions ??= {};
    o.permissions[list] ??= [];
    if (!o.permissions[list].includes(rule)) o.permissions[list].push(rule);
    return;
  }
  if (f.what === "hook") {
    const event = f.event ?? "";
    const command = String(f.command ?? "").trim();
    if (!HOOK_EVENTS.includes(event)) throw new WriteError(400, "Pick when the hook runs.");
    if (!command) throw new WriteError(400, "Write the command the hook runs.");
    const entry: Record<string, any> = { hooks: [{ type: "command", command }] };
    if (TOOL_EVENTS.has(event) && f.matcher?.trim()) entry.matcher = f.matcher.trim();
    o.hooks ??= {};
    o.hooks[event] ??= [];
    o.hooks[event].push(entry);
    return;
  }
  throw new WriteError(400, "You can add a permission rule or a hook here.");
}

/** The settings file a form writes to: yours for every project, or a project's shared or local one. */
async function settingsFile(scope: unknown, local: unknown) {
  const project = scope && scope !== "global" ? await requireProject(String(scope)) : null;
  return project ? join(project, ".claude", local ? "settings.local.json" : "settings.json") : join(claudeDir(), "settings.json");
}

content.post("/settings/add", async (c) => {
  const f = await c.req.json();
  const file = await settingsFile(f.scope, f.local);
  const r = await updateJson(file, (o) => addToSettings(o, f));
  emit({ area: "library" });
  return c.json({ ...r, path: file, display: tildify(file) });
});

/** MCP servers go through Claude Code's own `claude mcp add`, which knows where each scope's servers are kept. */
content.post("/mcp/add", async (c) => {
  const f = await c.req.json();
  const name = String(f.name ?? "").trim();
  const target = String(f.target ?? "").trim();
  if (!/^[\w-]+$/.test(name)) throw new WriteError(400, "Use a name of letters, numbers, hyphens and underscores.");
  if (!target) throw new WriteError(400, f.transport === "stdio" ? "Write the command that starts the server." : "Paste the server's address.");
  const project = f.scope && f.scope !== "global" ? await requireProject(f.scope) : null;
  const claude = findClaude();
  if (!claude) throw new WriteError(400, "Claude Code isn't installed where the app can find it, so the server can't be added.");
  const env = String(f.env ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[A-Za-z_]\w*=/.test(l))
    .flatMap((l) => ["-e", l]);
  const args =
    f.transport === "stdio"
      ? ["mcp", "add", "--scope", project ? "project" : "user", ...env, name, "--", ...target.split(/\s+/)]
      : ["mcp", "add", "--transport", f.transport === "sse" ? "sse" : "http", "--scope", project ? "project" : "user", name, target];
  const p = Bun.spawn([claude, ...args], { cwd: project ?? claudeDir(), stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  if ((await p.exited) !== 0) throw new WriteError(400, (err || out).trim().split("\n")[0] || "Claude Code couldn't add the server.");
  emit({ area: "projects" });
  return c.json({ ok: true, message: out.trim() });
});

async function skillDir(path: string) {
  const dir = await itemTarget(path, "skill");
  if (!canRead(dir) || !(await isDir(dir))) throw new WriteError(400, "That folder isn't a skill. A skill is a folder with a SKILL.md file in it.");
  return dir;
}

content.post("/library/validate", async (c) => {
  const { path } = await c.req.json();
  return c.json(await runSkillsRef(await skillDir(path)));
});

/** Validate unsaved SKILL.md text: copy the folder to a temp dir, put the draft in it, validate that copy. */
content.post("/library/validate-draft", async (c) => {
  const { path, content: draft } = await c.req.json();
  const dir = await skillDir(path);
  const tmp = await mkdtemp(join(tmpdir(), "cc-skill-"));
  try {
    const copy = join(tmp, basename(dir)); // the validator checks the folder name against the skill name
    await cp(dir, copy, { recursive: true });
    await writeFile(join(copy, "SKILL.md"), String(draft ?? ""), "utf8");
    const r = await runSkillsRef(copy);
    return c.json({ ...r, output: r.output.split(copy).join(tildify(dir)) });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

// ---- Memory index ----

const memoryDir = (folder: string) => {
  if (!/^[\w.-]+$/.test(folder)) throw new WriteError(400, "That memory folder name isn't valid.");
  return join(claudeDir(), "projects", folder, "memory");
};

async function memoryCheck(folder: string) {
  const dir = memoryDir(folder);
  const notes = (await ls(dir)).filter((f) => f.endsWith(".md") && f !== "MEMORY.md");
  const index = await readWithHash(join(dir, "MEMORY.md"));
  const linked = new Set([...(index?.content ?? "").matchAll(/\]\(([^)]+\.md)\)/g)].map((m) => m[1]));
  return {
    folder,
    notes: notes.length,
    missingFromIndex: notes.filter((n) => !linked.has(n)),
    deadLinks: [...linked].filter((l) => !notes.includes(l)),
    index,
  };
}

content.get("/memory/check", async (c) => {
  const folders = [...new Set((await memoryItems()).map((i) => i.sourceName!))];
  const out = [];
  for (const f of folders) {
    const { index, ...r } = await memoryCheck(f);
    out.push(r);
  }
  return c.json(out);
});

content.post("/memory/sync", async (c) => {
  const { folder } = await c.req.json();
  const dir = memoryDir(folder);
  const { index, missingFromIndex, deadLinks } = await memoryCheck(folder);
  const lines = (index?.content ?? "").split("\n").filter((l) => !deadLinks.some((d) => l.includes(`](${d})`)));
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  for (const f of missingFromIndex) {
    const md = await readMd(join(dir, f));
    const title = String(md?.data.name ?? f.replace(/\.md$/, ""));
    const desc = md?.data.description ? ` — ${String(md.data.description)}` : "";
    lines.push(`- [${title}](${f})${desc}`);
  }
  const r = await safeWrite(join(dir, "MEMORY.md"), lines.join("\n") + "\n", index?.hash ?? null);
  emit({ area: "memory" });
  return c.json({ ...r, added: missingFromIndex.length, removed: deadLinks.length });
});

// ---- Settings ----

/** The settings files for a project (or for every project), highest first, each parsed with env values redacted. */
async function readSettingsFiles(projectId: string | undefined) {
  const dir = projectId ? await requireProject(projectId) : null;
  const files: { source: Source; path: string }[] = [
    { source: "managed", path: managedSettingsPath() },
    ...(dir
      ? [
          { source: "local" as Source, path: join(dir, ".claude", "settings.local.json") },
          { source: "project" as Source, path: join(dir, ".claude", "settings.json") },
        ]
      : []),
    { source: "user", path: join(claudeDir(), "settings.json") },
  ];
  const parsed: Partial<Record<Source, Record<string, unknown>>> = {};
  const sources = [];
  for (const f of files) {
    const cur = await readWithHash(f.path).catch(() => null);
    let error: string | null = null;
    if (cur) {
      error = jsonProblem(cur.content);
      // Environment variable values can be secrets: only their names leave the server here.
      if (!error) parsed[f.source] = redactEnv(JSON.parse(cur.content))!;
    }
    sources.push({ source: f.source, path: f.path, display: tildify(f.path), exists: !!cur, hash: cur?.hash ?? null, access: classify(f.path), error, values: parsed[f.source] ?? null });
  }
  return { parsed, sources };
}

content.get("/settings", async (c) => {
  const { parsed, sources } = await readSettingsFiles(c.req.query("project"));
  // Keyboard shortcuts and themes exist only for all projects, so they come with every settings view.
  return c.json({
    sources,
    entries: effective(parsed),
    keybindings: { ...(await readKeybindings()), contexts: KEY_CONTEXTS, actions: KEY_ACTIONS },
    themes: await listThemes(),
  });
});

/**
 * Every documented setting by topic (code.claude.com settings reference), with its value now and the file that
 * set it, from the same files and order as GET /settings.
 */
content.get("/settings/reference", async (c) => {
  const [{ ref, origin }, { parsed, sources }] = await Promise.all([settingsReference(), readSettingsFiles(c.req.query("project"))]);
  return c.json({
    url: REFERENCE_URL,
    fetchedAt: ref.fetchedAt,
    origin,
    sources: sources.map(({ source, display, exists, access, error }) => ({ source, display, exists, access, error })),
    topics: ref.topics.map((t) => ({ ...t, settings: t.settings.map((s) => ({ ...s, targets: writableIn(s.scope), ...valueNow(parsed, s.key) })) })),
  });
});

/**
 * Sets or removes one documented setting in the file picked in "Change settings for". Only that key's lines change.
 * `hash` is the file's hash when the browser read it (null when it didn't exist), so a newer file on disk is never overwritten.
 */
content.post("/settings/set", async (c) => {
  const f = (await c.req.json()) as { scope?: string; local?: boolean; key?: string; value?: unknown; hash?: string | null };
  if (f.hash === undefined) throw new WriteError(400, "Reload the page and try again.");
  const setting = (await settingsReference()).ref.topics.flatMap((t) => t.settings).find((s) => s.key === f.key);
  if (!setting) throw new WriteError(400, "That isn't a setting in Claude Code's settings reference.");
  const target = !f.scope || f.scope === "global" ? "user" : f.local ? "local" : "project";
  // The key's values in the other user, project and local files, so a switch turned off can write false where removing it would leave it on.
  const { parsed } = await readSettingsFiles(target === "user" ? undefined : f.scope);
  const others = (["user", "project", "local"] as const).filter((t) => t !== target).map((t) => valueNow({ [t]: parsed[t] }, setting.key).value);
  const value = settingValue(setting, target, f.value, others);
  const file = await settingsFile(f.scope, f.local);
  const cur = await readWithHash(file);
  const problem = cur ? jsonProblem(cur.content) : null;
  if (problem) throw new WriteError(400, `${problem} Fix it as text first.`);
  const text = setKeyInText(cur?.content ?? "", setting.key, value);
  if (text === (cur?.content ?? "")) return c.json({ hash: cur?.hash ?? null, backupPath: null, path: file, display: tildify(file) }); // nothing to remove
  const r = await safeWrite(file, text, f.hash);
  emit({ area: "settings" });
  return c.json({ ...r, path: file, display: tildify(file) });
});

/** One environment variable's value, sent only when someone clicks to see it. */
content.get("/settings/env-value", async (c) => {
  const source = c.req.query("source");
  const name = c.req.query("name") ?? "";
  const project = c.req.query("project");
  if (source !== "managed" && source !== "user" && !(source === "project" || source === "local")) throw new WriteError(400, "Pick the settings file.");
  if ((source === "project" || source === "local") && !project) throw new WriteError(400, "Pick the project.");
  const file = source === "managed" ? managedSettingsPath() : await settingsFile(source === "user" ? "global" : project, source === "local");
  const cur = await readWithHash(file).catch(() => null);
  const env = cur && !jsonProblem(cur.content) ? (JSON.parse(cur.content) as { env?: Record<string, unknown> }).env : null;
  if (!env || typeof env !== "object" || !(name in env)) throw new WriteError(404, "That variable isn't in this file any more.");
  return c.json({ value: String(env[name]) });
});

/** One change from the Settings page to one settings file: permissions, model, env, status line, sandbox or theme. */
content.post("/settings/change", async (c) => {
  const f = (await c.req.json()) as { scope?: string; local?: boolean; change: SettingsChange };
  const file = await settingsFile(f.scope, f.local);
  const themes = (await listThemes()).map((t) => t.slug);
  const r = await updateJson(file, (o) => applySettingsChange(o, f.change ?? ({} as SettingsChange), themes));
  emit({ area: "settings" });
  return c.json({ ...r, path: file, display: tildify(file) });
});

/** Keyboard shortcuts live only in ~/.claude/keybindings.json. */
content.post("/keybindings/set", async (c) => {
  const f = await c.req.json();
  const file = join(claudeDir(), "keybindings.json");
  const r = await updateJson(file, (o) => setKeybinding(o, String(f.context ?? ""), String(f.keys ?? ""), f.action === null ? null : String(f.action ?? "")));
  emit({ area: "settings" });
  return c.json({ ...r, path: file, display: tildify(file) });
});

content.post("/keybindings/remove", async (c) => {
  const f = await c.req.json();
  const file = join(claudeDir(), "keybindings.json");
  const r = await updateJson(file, (o) => removeKeybinding(o, String(f.context ?? ""), String(f.keys ?? "")));
  emit({ area: "settings" });
  return c.json({ ...r, path: file, display: tildify(file) });
});

// ---- Map and search ----

content.get("/map", async (c) => {
  const projects = (await listProjects()).filter((p) => !p.empty);
  const groups = await buildMap(projects.map((p) => ({ id: p.id, name: p.name, dir: untildify(p.id) })));
  // Which settings file wins, highest first (command-line --settings is per launch and not on disk).
  const precedence = [
    { source: "managed", label: "Managed", path: managedSettingsPath(), note: "Set by an organization. Nothing overrides it.", exists: await Bun.file(managedSettingsPath()).exists() },
    { source: "local", label: "Local", path: ".claude/settings.local.json", note: "Your settings for one project, not shared.", exists: true },
    { source: "project", label: "Project", path: ".claude/settings.json", note: "Shared through the project's repository.", exists: true },
    { source: "user", label: "User", path: tildify(join(claudeDir(), "settings.json")), note: "Your settings for every project.", exists: await Bun.file(join(claudeDir(), "settings.json")).exists() },
  ];
  return c.json({ groups, precedence });
});

content.get("/search", async (c) => {
  const q = c.req.query("q") ?? "";
  const projects = await listProjects();
  const hits = searchDocs(q, 40).map((h) => {
    let link = `/file?path=${encodeURIComponent(h.ref)}`;
    if (h.kind === "session") {
      const s = listSessions().find((x) => x.file === h.ref);
      link = s ? `/sessions/${s.sessionId}` : "/sessions";
    } else if (h.kind === "doc") {
      const p = projects.find((p) => isInside(h.ref, untildify(p.id)));
      const name = basename(h.ref);
      if (p && name === "BACKLOG.md") link = `/projects/${encodeURIComponent(p.id)}#backlog`;
      else if (p && name === "CHANGELOG.md") link = `/projects/${encodeURIComponent(p.id)}#changelog`;
    }
    return { ...h, link, display: h.kind === "session" ? h.subtitle : tildify(h.ref) };
  });
  const lower = q.toLowerCase();
  const projectHits = lower
    ? projects.filter((p) => p.name.toLowerCase().includes(lower)).slice(0, 5).map((p) => ({ kind: "project", ref: p.id, title: p.name, subtitle: p.path, snippet: "", link: `/projects/${encodeURIComponent(p.id)}`, display: p.path }))
    : [];
  return c.json([...projectHits, ...hits]);
});

// ---- Everything, for the feature pages ----

content.get("/catalog", async (c) => c.json(await catalog()));

/** A removed hook as Archived items keeps it: its event, its group's other fields (such as `matcher`) and the hook. */
export interface KeptHook {
  event: string;
  group: Record<string, any>;
  hook: Record<string, any>;
}

/** Removes one hook from a settings file, and its event entry when it was the last one. Returns what was removed. */
export function removeHook(o: Record<string, any>, event: string, group: number, index: number): KeptHook {
  const groups = o.hooks?.[event];
  const g = Array.isArray(groups) ? groups[group] : null;
  if (!g || !Array.isArray(g.hooks) || !g.hooks[index]) throw new WriteError(409, "That hook has already changed. Reload and try again.");
  const { hooks: _, ...rest } = g;
  const [hook] = g.hooks.splice(index, 1);
  if (!g.hooks.length) groups.splice(group, 1);
  if (!groups.length) delete o.hooks[event];
  if (!Object.keys(o.hooks).length) delete o.hooks;
  return { event, group: rest, hook };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Puts a removed hook back: into a group with the same matcher when there is one, otherwise in a new group. */
export function putHookBack(o: Record<string, any>, k: KeptHook) {
  o.hooks ??= {};
  o.hooks[k.event] ??= [];
  const groups: any[] = o.hooks[k.event];
  const g = groups.find((x) => x && Array.isArray(x.hooks) && same(Object.fromEntries(Object.entries(x).filter(([key]) => key !== "hooks")), k.group));
  if (g?.hooks.some((h: unknown) => same(h, k.hook))) throw new WriteError(409, "That hook is already there.");
  if (g) g.hooks.push(k.hook);
  else groups.push({ ...k.group, hooks: [k.hook] });
}

const hookName = (k: KeptHook) => `${k.event}: ${k.hook.command ?? k.hook.prompt ?? k.hook.url ?? k.hook.type ?? "hook"}`;

content.post("/hooks/remove", async (c) => {
  const { path, event, group, index } = await c.req.json();
  const abs = untildify(String(path ?? ""));
  if (!/settings(\.local)?\.json$/.test(abs)) throw new WriteError(400, "Hooks are removed from settings files only.");
  let kept: KeptHook | null = null;
  const r = await updateJson(abs, (o) => {
    kept = removeHook(o, String(event), Number(group), Number(index));
  });
  await archiveEntry("hook", hookName(kept!), abs, kept);
  emit({ area: "library" });
  emit({ area: "archive" });
  return c.json(r);
});

/** A removed MCP server as Archived items keeps it: what `claude mcp add-json` needs to add it back. */
interface KeptMcp {
  name: string;
  scope: "user" | "project" | "local";
  cwd: string;
  config: Record<string, any>;
}

/** Where Claude Code keeps a server of each scope (the MCP docs' scope table) and its definition there. */
async function mcpDefinition(name: string, scope: KeptMcp["scope"], cwd: string) {
  if (scope === "project") {
    const file = join(cwd, ".mcp.json");
    return { file, config: (await readJson<{ mcpServers?: Record<string, any> }>(file))?.mcpServers?.[name] };
  }
  const cj = (await readJson<{ mcpServers?: Record<string, any>; projects?: Record<string, { mcpServers?: Record<string, any> }> }>(claudeJson())) ?? {};
  return { file: claudeJson(), config: scope === "user" ? cj.mcpServers?.[name] : cj.projects?.[cwd]?.mcpServers?.[name] };
}

async function putMcpBack(k: KeptMcp) {
  if (!(await isDir(k.cwd))) throw new WriteError(409, `${tildify(k.cwd)} isn't there any more, so the server can't be added back to it.`);
  const r = await runClaude(["mcp", "add-json", k.name, JSON.stringify(k.config), "--scope", k.scope], k.cwd);
  if (r.code !== 0) throw new WriteError(400, (r.err || r.out).trim().split("\n")[0] || "Claude Code couldn't add the server back.");
}

content.post("/mcp/remove", async (c) => {
  const { name, scope, project } = await c.req.json();
  if (!/^[\w.-]+$/.test(String(name ?? ""))) throw new WriteError(400, "That server name isn't valid.");
  if (!["user", "project", "local"].includes(scope)) throw new WriteError(400, "Servers from a plugin are removed with the plugin.");
  const cwd = scope === "user" ? claudeDir() : await requireProject(String(project ?? ""));
  const { file, config } = await mcpDefinition(String(name), scope, cwd);
  const r = await runClaude(["mcp", "remove", String(name), "--scope", scope], cwd);
  if (r.code !== 0) throw new WriteError(400, (r.err || r.out).trim().split("\n")[0] || "Claude Code couldn't remove the server.");
  if (config) await archiveEntry("mcp", String(name), file, { name: String(name), scope, cwd, config } satisfies KeptMcp);
  emit({ area: "library" });
  emit({ area: "archive" });
  return c.json({ ok: true, archived: !!config });
});

// ---- Plugins, through Claude Code's own plugin commands ----

let availableCache: { at: number; list: Available[]; added: string[] } | null = null;

async function availablePlugins(fresh = false) {
  if (!fresh && availableCache && Date.now() - availableCache.at < 10 * 60_000) return availableCache;
  const [r, m] = await Promise.all([runClaude(["plugin", "list", "--json", "--available"]), runClaude(["plugin", "marketplace", "list", "--json"])]);
  if (r.code !== 0) throw new WriteError(400, (r.err || r.out).trim().split("\n")[0] || "Claude Code couldn't list the marketplaces' plugins.");
  availableCache = { at: Date.now(), list: parseAvailable(r.out), added: m.code === 0 ? parseMarketplaces(m.out) : [] };
  return availableCache;
}

/** Plugins your marketplaces offer that you haven't installed, best match and most installed first. */
content.get("/plugins/available", async (c) => {
  const { list, added } = await availablePlugins();
  const { count, hits } = searchAvailable(list, (c.req.query("q") ?? "").trim().slice(0, 200));
  return c.json({ total: list.length, marketplaces: marketplaceCounts(list, added), count, hits });
});

/**
 * A plugin in your skills folder isn't installed, so it's removed by moving its folder to the app's archive
 * (the docs: "To stop loading a scaffolded plugin, delete its directory"). Its on/off entry goes from your settings too.
 */
async function removeSkillsDirPlugin(id: string) {
  const name = id.slice(0, -"@skills-dir".length);
  const p = (await skillsDirPlugins(join(claudeDir(), "skills"))).find((x) => x.name === name);
  if (!p) throw new WriteError(404, `There's no plugin called ${name} in ${tildify(join(claudeDir(), "skills"))}.`);
  await archiveItem(p.dir, "plugin");
  const settings = join(claudeDir(), "settings.json");
  const cur = await readWithHash(settings);
  if (cur && JSON.parse(cur.content)?.enabledPlugins?.[id] !== undefined) {
    await updateJson(settings, (o) => {
      delete o.enabledPlugins[id];
      if (!Object.keys(o.enabledPlugins).length) delete o.enabledPlugins;
    });
  }
  emit({ area: "archive" });
  return `Moved ${tildify(p.dir)} to Archived items.`;
}

content.post("/plugins/:action", async (c) => {
  const action = c.req.param("action");
  const { id } = await c.req.json();
  const args = pluginArgs(action, id);
  let message: string;
  if (action === "uninstall" && String(id).endsWith("@skills-dir")) message = await removeSkillsDirPlugin(String(id));
  else ({ message } = pluginResult(action, await runClaude(args)));
  availableCache = null;
  emit({ area: "library" });
  return c.json({ ok: true, message });
});

content.post("/plugins-new", async (c) => {
  const { name, args } = initArgs(await c.req.json());
  const skills = join(claudeDir(), "skills");
  const { message, notes, path } = initResult(await runClaude(args), name, skills);
  emit({ area: "library" });
  return c.json({ ok: true, id: `${name}@skills-dir`, path, manifest: join(path, ".claude-plugin", "plugin.json"), display: tildify(path), message, notes });
});
