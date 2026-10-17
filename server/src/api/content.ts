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
import { addEntry, parseChangelog } from "../parsers/changelog";
import { effective, type Source } from "../parsers/settings";
import { search as searchDocs, listSessions } from "../db/index";
import { globalLibrary, memoryItems, projectLibrary } from "../scan/library";
import { buildMap, managedSettingsPath } from "../scan/map";
import { listProjects, projectDir, projectPathOf } from "../scan/projects";
import { isDir, ls, readMd } from "../scan/md";
import type { Env } from "./env";

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
  const backlogFile = await readWithHash(join(dir, "BACKLOG.md"));
  const changelogFile = await readWithHash(join(dir, "CHANGELOG.md"));
  const worktrees = (await ls(join(dir, ".claude", "worktrees"))).map((n) => ({ name: n, path: tildify(join(dir, ".claude", "worktrees", n)) }));
  const sessions = listSessions()
    .filter((s) => s.cwd && isInside(projectPathOf(s.cwd), dir))
    .slice(0, 100)
    .map(({ file, ...s }) => ({ ...s, worktree: s.cwd !== projectPathOf(s.cwd!) }));
  return c.json({
    ...summary,
    abs: dir,
    backlog: backlogFile ? { ...parseBacklog(backlogFile.content), hash: backlogFile.hash, path: join(dir, "BACKLOG.md") } : null,
    changelog: changelogFile ? { ...parseChangelog(changelogFile.content), hash: changelogFile.hash, path: join(dir, "CHANGELOG.md") } : null,
    docs: summary.docs.map((d) => ({ name: d, path: join(dir, d) })),
    library: await projectLibrary(dir),
    worktrees,
    sessions,
  });
});

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
  return c.json(await editProjectFile(c.req.param("id"), "BACKLOG.md", hash, (t) => toggleItem(t, line)));
});
content.post("/projects/:id/backlog/edit", async (c) => {
  const { line, text, hash } = await c.req.json();
  return c.json(await editProjectFile(c.req.param("id"), "BACKLOG.md", hash, (t) => editItemText(t, line, text)));
});
content.post("/projects/:id/backlog/add", async (c) => {
  const { sectionLine, text, hash } = await c.req.json();
  return c.json(await editProjectFile(c.req.param("id"), "BACKLOG.md", hash, (t) => addItem(t, sectionLine, text)));
});
content.post("/projects/:id/changelog", async (c) => {
  const { text, hash } = await c.req.json();
  return c.json(await editProjectFile(c.req.param("id"), "CHANGELOG.md", hash, (t) => addEntry(t, text)));
});

// ---- Files ----

content.get("/file", async (c) => {
  const abs = untildify(c.req.query("path") ?? "");
  if (!canRead(abs)) throw new WriteError(403, classify(abs) === "secret" ? "This file holds secrets and is never shown." : "The app can't open files here.");
  const st = await stat(abs).catch(() => null);
  if (!st) throw new WriteError(404, "File not found.");
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
  if (!["on", "off", "name-only", "user-invocable-only"].includes(state)) throw new WriteError(400, "Unknown state.");
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

async function skillDir(path: string) {
  const dir = await itemTarget(path, "skill");
  if (!canRead(dir) || !(await isDir(dir))) throw new WriteError(400, "Not a skill folder.");
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
  if (!/^[\w.-]+$/.test(folder)) throw new WriteError(400, "Bad memory folder.");
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
      try {
        parsed[f.source] = JSON.parse(cur.content);
      } catch (e: any) {
        error = `Not valid JSON: ${e.message}`;
      }
    }
    sources.push({ source: f.source, path: f.path, display: tildify(f.path), exists: !!cur, access: classify(f.path), error });
  }
  return c.json({ sources, entries: effective(parsed) });
});

// ---- Map and search ----

content.get("/map", async (c) => {
  const projects = (await listProjects()).filter((p) => p.group === "root" && !p.empty);
  return c.json(await buildMap(projects.map((p) => ({ id: p.id, name: p.name, dir: untildify(p.id) }))));
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
      if (p && name === "BACKLOG.md") link = `/projects/${encodeURIComponent(p.id)}?tab=backlog`;
      else if (p && name === "CHANGELOG.md") link = `/projects/${encodeURIComponent(p.id)}?tab=changelog`;
    }
    return { ...h, link, display: h.kind === "session" ? h.subtitle : tildify(h.ref) };
  });
  const lower = q.toLowerCase();
  const projectHits = lower
    ? projects.filter((p) => p.name.toLowerCase().includes(lower)).slice(0, 5).map((p) => ({ kind: "project", ref: p.id, title: p.name, subtitle: p.path, snippet: "", link: `/projects/${encodeURIComponent(p.id)}`, display: p.path }))
    : [];
  return c.json([...projectHits, ...hits]);
});
