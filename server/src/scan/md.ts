import { readFile, readdir, stat } from "node:fs/promises";
import { parseFrontmatter } from "../parsers/frontmatter";
import { join } from "node:path";

export interface MdFile {
  data: Record<string, any>;
  body: string;
  error: string | null;
}

export async function readMd(abs: string): Promise<MdFile | null> {
  let text: string;
  try {
    text = await readFile(abs, "utf8");
  } catch {
    return null;
  }
  return parseFrontmatter(text);
}

export async function readJson<T = any>(abs: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(abs, "utf8"));
  } catch {
    return null;
  }
}

export async function ls(abs: string): Promise<string[]> {
  try {
    return (await readdir(abs)).filter((n) => !n.startsWith(".") && n !== "__pycache__");
  } catch {
    return [];
  }
}

export async function isDir(abs: string) {
  try {
    return (await stat(abs)).isDirectory();
  } catch {
    return false;
  }
}

export async function mtimeOf(abs: string): Promise<number | null> {
  try {
    return (await stat(abs)).mtimeMs;
  } catch {
    return null;
  }
}

export const firstLine = (s: string | undefined | null) =>
  (s ?? "")
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").trim())
    .find(Boolean) ?? "";

export { join };
