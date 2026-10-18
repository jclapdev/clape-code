import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import trash from "trash";
import { archiveDir, statePath } from "./paths";
import { canWrite, classify } from "./policy";
import { backup, exists, WriteError } from "./safeWrite";

export type ArchiveKind = "agent" | "skill" | "command" | "plan" | "memory" | "rule" | "output-style" | "workflow" | "scheduled-task" | "file";

export interface ArchiveRecord {
  id: string;
  kind: ArchiveKind;
  name: string;
  originalPath: string;
  archivedAt: string;
}

const manifestOf = (id: string) => join(archiveDir(), id, "archive.json");

/** rename() fails across drives on Windows; fall back to copy + remove. */
async function move(from: string, to: string) {
  await mkdir(dirname(to), { recursive: true });
  try {
    await rename(from, to);
  } catch (e: any) {
    if (e.code !== "EXDEV") throw e;
    await cp(from, to, { recursive: true });
    await rm(from, { recursive: true, force: true });
  }
}

/** Move a file or folder out of Claude Code's reach, keeping a record of where it came from. */
export async function archiveItem(abs: string, kind: ArchiveKind): Promise<ArchiveRecord> {
  if (!canWrite(abs)) throw new WriteError(403, "Only files you own can be archived.");
  if (!(await exists(abs))) throw new WriteError(404, "Nothing at that path.");
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rec: ArchiveRecord = { id, kind, name: basename(abs), originalPath: abs, archivedAt: new Date().toISOString() };
  await move(abs, join(archiveDir(), id, "item", basename(abs)));
  await writeFile(manifestOf(id), JSON.stringify(rec, null, 2));
  return rec;
}

export async function listArchive(): Promise<ArchiveRecord[]> {
  let ids: string[] = [];
  try {
    ids = await readdir(archiveDir());
  } catch {
    return [];
  }
  const out: ArchiveRecord[] = [];
  for (const id of ids) {
    try {
      out.push(JSON.parse(await readFile(manifestOf(id), "utf8")));
    } catch {
      /* not an archive entry */
    }
  }
  return out.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
}

export async function restoreItem(id: string): Promise<ArchiveRecord> {
  if (!/^[\w-]+$/.test(id)) throw new WriteError(400, "That isn't a valid archived item.");
  let rec: ArchiveRecord;
  try {
    rec = JSON.parse(await readFile(manifestOf(id), "utf8"));
  } catch {
    throw new WriteError(404, "No archived item with that id.");
  }
  if (await exists(rec.originalPath)) {
    throw new WriteError(409, "Something already exists where this item came from. Move it first.");
  }
  await move(join(archiveDir(), id, "item", rec.name), rec.originalPath);
  await rm(join(archiveDir(), id), { recursive: true, force: true });
  return rec;
}

/**
 * Send to the OS trash, where it can still be recovered.
 * Files Claude Code owns can only be trashed when `allowApp` is set (used for session transcripts).
 */
export async function trashItem(abs: string, opts: { allowApp?: boolean } = {}) {
  const access = classify(abs);
  if (!(access === "edit" || (opts.allowApp && access === "app"))) {
    throw new WriteError(403, "This item can't be deleted from the app.");
  }
  if (!(await exists(abs))) throw new WriteError(404, "Nothing at that path.");
  if (access === "edit" && (await stat(abs)).isFile()) await backup(abs);
  await trash(abs);
}

// ---- Per-user flags that are not files Claude Code reads ----

export interface AppState {
  archivedSessions: Record<string, string>; // sessionId -> ISO time
}

export async function readState(): Promise<AppState> {
  try {
    const s = JSON.parse(await readFile(statePath(), "utf8"));
    return { archivedSessions: s.archivedSessions ?? {} };
  } catch {
    return { archivedSessions: {} };
  }
}

export async function writeState(s: AppState) {
  await mkdir(dirname(statePath()), { recursive: true });
  const tmp = statePath() + ".tmp";
  await writeFile(tmp, JSON.stringify(s, null, 2));
  await rename(tmp, statePath());
}
