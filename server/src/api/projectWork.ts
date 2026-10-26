// Projects: the board read from BACKLOG.md, context files in docs/ and the CLAUDE.md lines that import them,
// and making a new project. Every file write goes through safeWrite.
import { Hono } from "hono";
import { mkdir, readdir, stat } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import { getConfig } from "../config";
import { emit } from "../events";
import { claudeDir, isInside, tildify, untildify } from "../fs/paths";
import { readWithHash, safeWrite, WriteError } from "../fs/safeWrite";
import { canRead, classify } from "../fs/policy";
import { attachSteps, parseBacklogBoard } from "../parsers/backlogBoard";
import { appendFeedback } from "../parsers/feedback";
import { addImport, importedPaths, removeImport } from "../parsers/imports";
import { listProjects, projectDir } from "../scan/projects";
import type { Env } from "./env";

export const projectWork = new Hono<Env>();

/** Largest file Add context takes: the same limit as the app's text editor. */
export const MAX_CONTEXT_BYTES = 2 * 1024 * 1024;

async function requireProject(id: string) {
  const dir = await projectDir(decodeURIComponent(id));
  if (!dir) throw new WriteError(404, "Unknown project.");
  return dir;
}

const toPosix = (p: string) => p.split(sep).join("/");

// ---- Board ----

/** A project file's text, or null when it's missing or the access policy doesn't allow reading it. */
async function readAllowed(abs: string) {
  if (!canRead(abs)) return null;
  return (await readWithHash(abs))?.content ?? null;
}

/** BACKLOG.md as Open / In spec / Done, with features.json's steps on in-spec cards. No BACKLOG.md: three empty columns. */
export async function boardOf(dir: string) {
  const path = join(dir, "BACKLOG.md");
  const text = await readAllowed(path);
  const columns = parseBacklogBoard(text ?? "");
  if (columns[1].cards.length) attachSteps(columns, await readAllowed(join(dir, "features.json")));
  return { path: text === null ? null : path, columns };
}

projectWork.get("/projects/:id/board", async (c) => c.json(await boardOf(await requireProject(c.req.param("id")))));

// ---- Feedback ----

/** Longest note Feedback takes. */
const MAX_NOTE = 10_000;

/**
 * Adds a note as a new pending, open line in the project's BACKLOG.md, or in ~/.claude/BACKLOG.md when no project is given.
 * A missing file starts from the feature skill's template, without its example row.
 */
projectWork.post("/feedback", async (c) => {
  const { project, note } = await c.req.json();
  if (typeof note !== "string" || !note.trim()) throw new WriteError(400, "Type a note first.");
  if (note.length > MAX_NOTE) throw new WriteError(400, "This note is too long to save.");
  let abs = join(claudeDir(), "BACKLOG.md");
  if (project) {
    const dir = typeof project === "string" ? await projectDir(project) : null;
    if (!dir) throw new WriteError(404, "Unknown project.");
    abs = join(dir, "BACKLOG.md");
  }
  if (classify(abs) !== "edit") throw new WriteError(403, "The app can't change this file.");
  const cur = await readWithHash(abs);
  const template = cur ? null : await readAllowed(join(claudeDir(), "skills", "feature", "assets", "BACKLOG.md"));
  const { text, n } = appendFeedback(cur?.content ?? null, note, new Date(), template);
  await safeWrite(abs, text, cur?.hash ?? null);
  emit({ area: "projects", path: abs });
  return c.json({ n, path: tildify(abs) });
});

// ---- Context files ----

/** The CLAUDE.md that holds the imports: the one at the project root, or .claude/CLAUDE.md when only that exists. */
async function claudeMdOf(dir: string) {
  const root = join(dir, "CLAUDE.md");
  const inner = join(dir, ".claude", "CLAUDE.md");
  if (!(await Bun.file(root).exists()) && (await Bun.file(inner).exists())) return inner;
  return root;
}

/** The import path for a docs/ file, relative to the CLAUDE.md that imports it, as the memory docs require. */
const importPath = (claudeMd: string, file: string) => toPosix(relative(dirname(claudeMd), file));

export async function contextOf(dir: string) {
  const docs = join(dir, "docs");
  const claudeMd = await claudeMdOf(dir);
  const md = await readWithHash(claudeMd);
  const imported = new Set(md ? importedPaths(md.content) : []);
  const names = (await readdir(docs).catch(() => [] as string[])).filter((n) => !n.startsWith("."));
  const files = [];
  for (const name of names.sort((a, b) => a.localeCompare(b))) {
    const abs = join(docs, name);
    const s = await stat(abs).catch(() => null);
    if (!s?.isFile()) continue;
    files.push({ name, path: abs, size: s.size, imported: imported.has(importPath(claudeMd, abs)) });
  }
  return { folder: docs, claudeMd: { path: claudeMd, display: toPosix(relative(dir, claudeMd)), hash: md?.hash ?? null }, files };
}

/** A file name safe on every system and in an `@` import: letters, digits, dot, dash and underscore. */
export function contextName(raw: string) {
  const base = basename(raw.replace(/\\/g, "/"))
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+/, "")
    .slice(0, 120);
  if (!base || !/[A-Za-z0-9]/.test(base)) throw new WriteError(400, "That file name has no letters or numbers to keep.");
  return base;
}

/** The file's text, or why it can't be added. safeWrite writes text, so binary files are refused. */
export function contextText(name: string, bytes: Uint8Array) {
  if (bytes.byteLength > MAX_CONTEXT_BYTES) throw new WriteError(400, `${name} is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB. Files up to 2 MB can be added.`);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = "\0";
  }
  if (text.includes("\0")) throw new WriteError(400, `${name} isn't a text file. Only text files (such as Markdown, plain text, code or CSV) can be added; save a PDF or Word file as Markdown or text first.`);
  return text;
}

projectWork.post("/projects/:id/context", async (c) => {
  const dir = await requireProject(c.req.param("id"));
  const form = await c.req.parseBody();
  const file = form.file;
  if (!(file instanceof File)) throw new WriteError(400, "No file was sent.");
  const name = contextName(file.name);
  const text = contextText(file.name, new Uint8Array(await file.arrayBuffer()));
  const abs = join(dir, "docs", name);
  if (await Bun.file(abs).exists()) throw new WriteError(409, `docs/${name} already exists. Rename the file, or delete or rename the one in docs/ first.`);
  const r = await safeWrite(abs, text, null);
  emit({ area: "projects", path: abs });
  return c.json({ ...r, name, renamed: name !== file.name });
});

projectWork.post("/projects/:id/context/import", async (c) => {
  const dir = await requireProject(c.req.param("id"));
  const { name, on, hash } = await c.req.json();
  const file = join(dir, "docs", contextName(String(name ?? "")));
  if (!(await Bun.file(file).exists())) throw new WriteError(404, `docs/${name} not found.`);
  const claudeMd = await claudeMdOf(dir);
  const cur = await readWithHash(claudeMd);
  if ((cur?.hash ?? null) !== (hash ?? null)) throw new WriteError(409, "CLAUDE.md changed on disk after you opened the page.", cur ?? { content: "", hash: null });
  const rel = importPath(claudeMd, file);
  let next: string;
  try {
    next = on ? addImport(cur?.content ?? "", rel) : removeImport(cur?.content ?? "", rel);
  } catch (e: any) {
    throw new WriteError(400, e.message);
  }
  if (cur && next === cur.content) return c.json({ hash: cur.hash, backupPath: null });
  if (!cur && !on) return c.json({ hash: null, backupPath: null });
  const r = await safeWrite(claudeMd, next, cur?.hash ?? null);
  emit({ area: "projects", path: claudeMd });
  return c.json(r);
});

// ---- New project ----

export const starterClaudeMd = (name: string) =>
  `# ${name}

<!-- What this project is, how to build and test it, and the conventions Claude should follow. Run /init in a session to have Claude fill this in. -->
`;

/** Checks a new project's name and folder. The folder must sit directly in one of the project folders, which is where the app finds projects. */
export async function newProjectTarget(nameRaw: unknown, folderRaw: unknown) {
  const name = String(nameRaw ?? "").trim();
  if (!/^[A-Za-z0-9][\w.-]{0,79}$/.test(name)) throw new WriteError(400, "Use a name of letters, numbers, dots, dashes and underscores, starting with a letter or number, without spaces.");
  const roots = (await getConfig()).projectRoots.map(untildify);
  const folder = folderRaw ? untildify(String(folderRaw).trim()) : join(roots[0], name);
  const root = roots.find((r) => isInside(folder, r) && dirname(folder).toLowerCase() === r.toLowerCase());
  if (!root) throw new WriteError(400, `Pick a folder directly inside ${roots.map(tildify).join(" or ")}, so it shows up under Projects. You can add more project folders in Preferences.`);
  return { name, folder };
}

async function gitInit(dir: string) {
  try {
    const p = Bun.spawn(["git", "init"], { cwd: dir, stdout: "ignore", stderr: "ignore" });
    return (await p.exited) === 0;
  } catch {
    return false; // git isn't installed
  }
}

projectWork.post("/projects-new", async (c) => {
  const body = await c.req.json();
  const { name, folder } = await newProjectTarget(body.name, body.folder);
  const entries = await readdir(folder).catch((e) => (e.code === "ENOENT" ? null : Promise.reject(e)));
  if (entries && entries.filter((e: string) => e !== ".DS_Store").length) throw new WriteError(409, `${tildify(folder)} already exists and isn't empty.`);
  await mkdir(folder, { recursive: true });
  await listProjects(); // the folder is now a project, so safeWrite may write in it
  const git = await gitInit(folder);
  await safeWrite(join(folder, "CLAUDE.md"), starterClaudeMd(name), null);
  emit({ area: "projects", path: folder });
  return c.json({ id: tildify(folder), name, git });
});
