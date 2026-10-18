import { Hono } from "hono";
import { cp, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { archiveItem, listArchive, restoreItem, trashItem, type ArchiveKind } from "../fs/archive";
import { emit } from "../events";
import { claudeDir, isInside, tildify, untildify } from "../fs/paths";
import { canRead, classify } from "../fs/policy";
import { readWithHash, safeWrite, WriteError } from "../fs/safeWrite";
import { addItem, editItemText, parseBacklog, toggleItem } from "../parsers/backlog";
import { addEntry, isKeepAChangelog, parseChangelog } from "../parsers/changelog";
import { effective, type Source } from "../parsers/settings";
import { search as searchDocs, listSessions, untitled } from "../db/index";
import { globalLibrary, memoryItems, projectLibrary } from "../scan/library";
import { catalog } from "../scan/catalog";
import { buildMap, managedSettingsPath } from "../scan/map";
import { handoffName, listProjects, projectDir, projectPathOf } from "../scan/projects";
import { isDir, ls, readMd } from "../scan/md";
import type { Env } from "./env";
import { findClaude } from "../live/sessions";
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
  const handoff = handoffName(await readdir(dir).catch(() => [] as string[])) ?? "BACKLOG.md";
  const backlogFile = await readWithHash(join(dir, handoff));
  const changelogFile = await readWithHash(join(dir, "CHANGELOG.md"));
  const worktrees = (await ls(join(dir, ".claude", "worktrees"))).map((n) => ({ name: n, path: tildify(join(dir, ".claude", "worktrees", n)) }));
  const all = listSessions().filter((s) => s.cwd && isInside(projectPathOf(s.cwd), dir));
  const sessions = all
    .slice(0, 100)
    .map(({ file, ...s }) => ({ ...s, displayTitle: s.title ?? untitled(s.firstPrompt), worktree: s.cwd !== projectPathOf(s.cwd!) }));
  return c.json({
    ...summary,
    abs: dir,
    backlog: backlogFile ? { ...parseBacklog(backlogFile.content), hash: backlogFile.hash, path: join(dir, handoff), file: handoff } : null,
    changelog: changelogFile ? { ...parseChangelog(changelogFile.content), keep: isKeepAChangelog(changelogFile.content), hash: changelogFile.hash, path: join(dir, "CHANGELOG.md") } : null,
    docs: summary.docs.map((d) => ({ name: d, path: join(dir, d) })),
    library: await projectLibrary(dir),
    plans: await projectPlans(all),
    memory: (await memoryItems()).filter((m) => m.sourceName && isMemoryOf(m.sourceName, dir)),
    mcpServers: await mcpServersIn(join(dir, ".mcp.json")),
    worktrees,
    sessions,
  });
});

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

async function handoffOf(id: string) {
  return handoffName(await readdir(await requireProject(id)).catch(() => [] as string[])) ?? "BACKLOG.md";
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

content.post("/projects/:id/backlog/toggle", async (c) => {
  const { line, hash } = await c.req.json();
  return c.json(await editProjectFile(c.req.param("id"), await handoffOf(c.req.param("id")), hash, (t) => toggleItem(t, line)));
});
content.post("/projects/:id/backlog/edit", async (c) => {
  const { line, text, hash } = await c.req.json();
  return c.json(await editProjectFile(c.req.param("id"), await handoffOf(c.req.param("id")), hash, (t) => editItemText(t, line, text)));
});
content.post("/projects/:id/backlog/add", async (c) => {
  const { sectionLine, text, hash } = await c.req.json();
  return c.json(await editProjectFile(c.req.param("id"), await handoffOf(c.req.param("id")), hash, (t) => addItem(t, sectionLine, text)));
});
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

content.post("/library/plugin", async (c) => {
  const { key, enabled } = await c.req.json();
  const r = await updateJson(join(claudeDir(), "settings.json"), (o) => {
    o.enabledPlugins ??= {};
    o.enabledPlugins[key] = !!enabled;
  });
  emit({ area: "library" });
  return c.json(r);
});

/** The thing to move for an item: the folder for skills, the file for everything else. */
async function itemTarget(path: string, kind: string) {
  const abs = untildify(path);
  if (kind === "skill" && basename(abs) === "SKILL.md") return dirname(abs);
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
  const rec = await restoreItem(c.req.param("id"));
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

content.post("/settings/add", async (c) => {
  const f = await c.req.json();
  const project = f.scope && f.scope !== "global" ? await requireProject(f.scope) : null;
  const file = project ? join(project, ".claude", f.local ? "settings.local.json" : "settings.json") : join(claudeDir(), "settings.json");
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

content.get("/settings", async (c) => {
  const projectId = c.req.query("project");
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
      if (!error) parsed[f.source] = JSON.parse(cur.content);
    }
    sources.push({ source: f.source, path: f.path, display: tildify(f.path), exists: !!cur, access: classify(f.path), error });
  }
  return c.json({ sources, entries: effective(parsed) });
});

// ---- Map and search ----

content.get("/map", async (c) => {
  const projects = (await listProjects()).filter((p) => p.group === "root" && !p.empty);
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
      if (p && (name === "BACKLOG.md" || name === "PROGRESS.md")) link = `/projects/${encodeURIComponent(p.id)}#backlog`;
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

/** Removes one hook from a settings file, and its event entry when it was the last one. */
export function removeHook(o: Record<string, any>, event: string, group: number, index: number) {
  const groups = o.hooks?.[event];
  const g = Array.isArray(groups) ? groups[group] : null;
  if (!g || !Array.isArray(g.hooks) || !g.hooks[index]) throw new WriteError(409, "That hook has already changed. Reload and try again.");
  g.hooks.splice(index, 1);
  if (!g.hooks.length) groups.splice(group, 1);
  if (!groups.length) delete o.hooks[event];
  if (!Object.keys(o.hooks).length) delete o.hooks;
}

content.post("/hooks/remove", async (c) => {
  const { path, event, group, index } = await c.req.json();
  const abs = untildify(String(path ?? ""));
  if (!/settings(\.local)?\.json$/.test(abs)) throw new WriteError(400, "Hooks are removed from settings files only.");
  const r = await updateJson(abs, (o) => removeHook(o, String(event), Number(group), Number(index)));
  emit({ area: "library" });
  return c.json(r);
});

/** Runs a Claude Code command and returns its output, or an error in its own words. */
async function runClaude(args: string[], cwd?: string) {
  const claude = findClaude();
  if (!claude) throw new WriteError(400, "Claude Code isn't installed where the app can find it.");
  const p = Bun.spawn([claude, ...args], { cwd: cwd ?? claudeDir(), stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const timer = setTimeout(() => p.kill(), 120_000);
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  const code = await p.exited;
  clearTimeout(timer);
  return { code, out, err };
}

content.post("/mcp/remove", async (c) => {
  const { name, scope, project } = await c.req.json();
  if (!/^[\w.-]+$/.test(String(name ?? ""))) throw new WriteError(400, "That server name isn't valid.");
  if (!["user", "project", "local"].includes(scope)) throw new WriteError(400, "Servers from a plugin are removed with the plugin.");
  const cwd = scope === "user" ? claudeDir() : await requireProject(String(project ?? ""));
  const r = await runClaude(["mcp", "remove", String(name), "--scope", scope], cwd);
  if (r.code !== 0) throw new WriteError(400, (r.err || r.out).trim().split("\n")[0] || "Claude Code couldn't remove the server.");
  emit({ area: "library" });
  return c.json({ ok: true });
});

// ---- Plugins, through Claude Code's own plugin commands ----

type Available = { pluginId: string; name: string; marketplaceName: string; description?: string; version?: string; installCount?: number };
let availableCache: { at: number; list: Available[] } | null = null;

async function availablePlugins(fresh = false) {
  if (!fresh && availableCache && Date.now() - availableCache.at < 10 * 60_000) return availableCache.list;
  const r = await runClaude(["plugin", "list", "--json", "--available"]);
  if (r.code !== 0) throw new WriteError(400, (r.err || r.out).trim().split("\n")[0] || "Claude Code couldn't list the marketplaces' plugins.");
  const parsed = JSON.parse(r.out.slice(r.out.indexOf("{")));
  const list: Available[] = (parsed.available ?? []).map(({ source, ...a }: any) => a);
  availableCache = { at: Date.now(), list };
  return list;
}

/** Plugins your marketplaces offer that you haven't installed, best match and most installed first. */
content.get("/plugins/available", async (c) => {
  const q = (c.req.query("q") ?? "").trim().toLowerCase();
  const list = await availablePlugins();
  const words = q.split(/\s+/).filter(Boolean);
  const score = (a: Available) => {
    const name = a.name.toLowerCase();
    const text = `${name} ${(a.description ?? "").toLowerCase()}`;
    if (!words.every((w) => text.includes(w))) return -1;
    return (words.some((w) => name.includes(w)) ? 1e9 : 0) + (a.installCount ?? 0);
  };
  const hits = list.map((a) => [a, score(a)] as const).filter(([, s]) => s >= 0).sort((x, y) => y[1] - x[1]).slice(0, 40).map(([a]) => a);
  return c.json({ total: list.length, marketplaces: [...new Set(list.map((a) => a.marketplaceName))], hits });
});

const PLUGIN_ID = /^[\w.-]+(@[\w.-]+)?$/;

content.post("/plugins/:action", async (c) => {
  const action = c.req.param("action");
  const { id } = await c.req.json();
  if (!["install", "uninstall", "enable", "disable"].includes(action)) throw new WriteError(404, "Unknown plugin action.");
  if (!PLUGIN_ID.test(String(id ?? ""))) throw new WriteError(400, "That plugin name isn't valid.");
  const r = await runClaude(["plugin", action, String(id), "--json"]);
  const last = r.out.trim().split("\n").pop() ?? "";
  let res: { outcome?: string; message?: string } = {};
  try {
    res = JSON.parse(last);
  } catch {}
  if (r.code !== 0 || res.outcome === "failed") throw new WriteError(400, res.message || (r.err || r.out).trim().split("\n")[0] || `Claude Code couldn't ${action} the plugin.`);
  availableCache = null;
  emit({ area: "library" });
  return c.json({ ok: true, message: res.message ?? "" });
});

content.post("/plugins-new", async (c) => {
  const { name, description, with: parts } = await c.req.json();
  if (!SLUG.test(String(name ?? ""))) throw new WriteError(400, "Use a name of lowercase letters, numbers and single hyphens, such as my-helper.");
  const allowed = ["skills", "agents", "hooks", "mcp", "output-style"];
  const withArgs = (Array.isArray(parts) ? parts : []).filter((p: string) => allowed.includes(p));
  const args = ["plugin", "init", String(name), ...(description ? ["--description", String(description)] : []), ...(withArgs.length ? ["--with", ...withArgs] : [])];
  const r = await runClaude(args);
  if (r.code !== 0) throw new WriteError(400, (r.err || r.out).trim().split("\n")[0] || "Claude Code couldn't create the plugin.");
  emit({ area: "library" });
  const path = join(claudeDir(), "skills", String(name));
  return c.json({ ok: true, path, display: tildify(path), message: r.out.trim().split("\n")[0] });
});
