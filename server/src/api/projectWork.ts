// Projects: the board in PROGRESS.md, context files in docs/ and the CLAUDE.md lines that import them,
// and making a new project. Every file write goes through safeWrite.
import { Hono } from "hono";
import { mkdir, readdir, stat } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import { getConfig } from "../config";
import { emit } from "../events";
import { isInside, tildify, untildify } from "../fs/paths";
import { readWithHash, safeWrite, WriteError } from "../fs/safeWrite";
import { addCard, COLUMNS, deleteCard, editCard, moveCard, NEW_BOARD, parseBoard, type ColumnKey } from "../parsers/board";
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

export async function boardOf(dir: string) {
  const path = join(dir, "PROGRESS.md");
  const f = await readWithHash(path);
  if (!f) return null;
  return { path, hash: f.hash, columns: parseBoard(f.content) };
}

async function editBoard(id: string, hash: string, change: (text: string) => string) {
  const abs = join(await requireProject(id), "PROGRESS.md");
  const cur = await readWithHash(abs);
  if (!cur) throw new WriteError(404, "PROGRESS.md not found.");
  if (cur.hash !== hash) throw new WriteError(409, "The file changed on disk after you opened it.", cur);
  let next: string;
  try {
    next = change(cur.content);
  } catch (e: any) {
    throw new WriteError(400, e.message);
  }
  const r = next === cur.content ? { hash: cur.hash, backupPath: null } : await safeWrite(abs, next, cur.hash);
  emit({ area: "projects", path: abs });
  return r;
}

const columnKey = (v: unknown): ColumnKey => {
  if (COLUMNS.some((c) => c.key === v)) return v as ColumnKey;
  throw new WriteError(400, "Unknown column.");
};
const lineNo = (v: unknown) => {
  if (Number.isInteger(v) && (v as number) >= 0) return v as number;
  throw new WriteError(400, "Which card? The line number is missing.");
};

projectWork.post("/projects/:id/board/start", async (c) => {
  const abs = join(await requireProject(c.req.param("id")), "PROGRESS.md");
  if (await readWithHash(abs)) throw new WriteError(409, "This project already has a PROGRESS.md.");
  const r = await safeWrite(abs, NEW_BOARD, null);
  emit({ area: "projects", path: abs });
  return c.json(r);
});
projectWork.post("/projects/:id/board/add", async (c) => {
  const b = await c.req.json();
  return c.json(await editBoard(c.req.param("id"), b.hash, (t) => addCard(t, columnKey(b.column), String(b.text ?? ""))));
});
projectWork.post("/projects/:id/board/edit", async (c) => {
  const b = await c.req.json();
  return c.json(await editBoard(c.req.param("id"), b.hash, (t) => editCard(t, lineNo(b.line), String(b.text ?? ""))));
});
projectWork.post("/projects/:id/board/move", async (c) => {
  const b = await c.req.json();
  return c.json(await editBoard(c.req.param("id"), b.hash, (t) => moveCard(t, lineNo(b.line), columnKey(b.to))));
});
projectWork.post("/projects/:id/board/delete", async (c) => {
  const b = await c.req.json();
  return c.json(await editBoard(c.req.param("id"), b.hash, (t) => deleteCard(t, lineNo(b.line))));
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

Read PROGRESS.md at the start of a session. Keep its Next, In progress and Done lists up to date as work moves.
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
  await safeWrite(join(folder, "PROGRESS.md"), NEW_BOARD, null);
  emit({ area: "projects", path: folder });
  return c.json({ id: tildify(folder), name, git });
});
