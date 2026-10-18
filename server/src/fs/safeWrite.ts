import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";
import { parseFrontmatter } from "../parsers/frontmatter";
import { backupsDir, home, isInside } from "./paths";
import { canWrite, classify } from "./policy";

export class WriteError extends Error {
  constructor(
    public status: 400 | 403 | 404 | 409,
    message: string,
    public current?: { content: string; hash: string | null },
  ) {
    super(message);
  }
}

export const hashOf = (content: string | Buffer) => createHash("sha256").update(content).digest("hex");

export async function readWithHash(abs: string): Promise<{ content: string; hash: string } | null> {
  try {
    const buf = await readFile(abs);
    return { content: buf.toString("utf8"), hash: hashOf(buf) };
  } catch (e: any) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

/** Reject content that would break the file it is written to. */
export function validate(abs: string, content: string) {
  const ext = extname(abs).toLowerCase();
  if (ext === ".json") {
    try {
      JSON.parse(content);
    } catch (e: any) {
      throw new WriteError(400, `Not valid JSON: ${e.message}`);
    }
  }
  if (ext === ".md") {
    const { error } = parseFrontmatter(content);
    if (error) throw new WriteError(400, error);
  }
}

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    day: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, "0")}`,
  };
}

/** Copy a file into backups/<day>/<path under home>.<time> and return where it went. */
export async function backup(abs: string): Promise<string> {
  const { day, time } = stamp();
  const rel = isInside(abs, home()) ? relative(home(), abs) : abs.replace(/^[a-zA-Z]:/, "").replace(/^[\\/]+/, "");
  const dest = join(backupsDir(), day, `${rel}.${time}`);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(abs, dest);
  return dest;
}

/**
 * The only way the app changes a file.
 * `expectedHash` is the hash the browser saw when it opened the file, or null for a new file.
 * If the file changed on disk since then, nothing is written and the current content comes back.
 */
export async function safeWrite(abs: string, content: string, expectedHash: string | null) {
  if (!canWrite(abs)) {
    const why = classify(abs) === "app" ? "managed by Claude Code" : "outside the folders the app may change";
    throw new WriteError(403, `This file is ${why}.`);
  }
  const current = await readWithHash(abs);
  if ((current?.hash ?? null) !== expectedHash) {
    throw new WriteError(409, "The file changed on disk after you opened it.", current ?? { content: "", hash: null });
  }
  validate(abs, content);

  const backupPath = current ? await backup(abs) : null;
  await mkdir(dirname(abs), { recursive: true });
  const tmp = join(dirname(abs), `.${basename(abs)}.cc-${process.pid}-${Date.now()}.tmp`);
  try {
    await writeFile(tmp, content, "utf8");
    await rename(tmp, abs);
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
  return { hash: hashOf(content), backupPath };
}

export async function exists(abs: string) {
  try {
    await stat(abs);
    return true;
  } catch {
    return false;
  }
}
