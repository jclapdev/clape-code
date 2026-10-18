// `@path` imports in a CLAUDE.md, following code.claude.com/docs/en/memory (checked 2026-10-18):
// a relative path resolves from the file holding the import; a space in a path is written "\ ";
// imports inside code spans and fenced code blocks don't count.
// Adding or removing one changes only that line; every other line keeps its exact bytes.
import { fromSegs, insertLines, toSegs, type Seg } from "./eol";

const IMPORT = /(?:^|\s)@((?:[^\s`\\]|\\ )+)/g;
const ONLY_IMPORT = /^\s*(?:[-*] )?@((?:[^\s`\\]|\\ )+)\s*$/;

const norm = (p: string) => p.replace(/\\ /g, " ").replace(/^\.\//, "");

/** The import form of a path relative to the CLAUDE.md, with spaces escaped. */
export const importLine = (rel: string) => `@${rel.replace(/ /g, "\\ ")}`;

/** Each line outside fenced code blocks, with code spans blanked out. */
function proseLines(segs: Seg[]) {
  const out: { i: number; text: string }[] = [];
  let fence = false;
  segs.forEach((s, i) => {
    if (/^\s*(```|~~~)/.test(s.text)) {
      fence = !fence;
      return;
    }
    if (!fence) out.push({ i, text: s.text.replace(/`[^`]*`/g, (m) => " ".repeat(m.length)) });
  });
  return out;
}

/** Paths CLAUDE.md imports, as written (spaces unescaped, leading ./ dropped). */
export function importedPaths(md: string): string[] {
  const out: string[] = [];
  for (const { text } of proseLines(toSegs(md))) for (const m of text.matchAll(IMPORT)) out.push(norm(m[1]));
  return out;
}

export function addImport(md: string, rel: string): string {
  if (importedPaths(md).includes(rel)) return md;
  const segs = toSegs(md);
  const end = segs[segs.length - 1].text === "" ? segs.length - 1 : segs.length;
  const prev = end > 0 ? segs[end - 1].text : "";
  const lines = prev.trim() && !ONLY_IMPORT.test(prev) ? ["", importLine(rel)] : [importLine(rel)];
  insertLines(segs, end, lines);
  return fromSegs(segs);
}

/** Remove the lines that hold only this import. If it's also inside a sentence, say where instead of rewording it. */
export function removeImport(md: string, rel: string): string {
  const segs = toSegs(md);
  const drop = new Set<number>();
  for (const { i, text } of proseLines(segs)) {
    const m = ONLY_IMPORT.exec(text);
    if (m && norm(m[1]) === rel) drop.add(i);
  }
  // Imports at the very end of the file take the blank line addImport put before them along.
  let tail = segs[segs.length - 1].text === "" ? segs.length - 2 : segs.length - 1;
  while (tail >= 0 && drop.has(tail)) tail--;
  if (tail < (segs[segs.length - 1].text === "" ? segs.length - 2 : segs.length - 1) && tail > 0 && !segs[tail].text.trim() && segs[tail - 1].text.trim()) drop.add(tail);
  const rest = segs.filter((_, i) => !drop.has(i));
  const left = proseLines(rest).find(({ text }) => [...text.matchAll(IMPORT)].some((m) => norm(m[1]) === rel));
  if (left) {
    const line = segs.indexOf(rest[left.i]) + 1;
    throw new Error(`CLAUDE.md mentions @${rel} inside other text on line ${line}. Edit that line in CLAUDE.md to stop Claude reading it every session.`);
  }
  if (!drop.size) return md;
  // A removed last line hands the end of the file to the line before it.
  const lastDropped = drop.has(segs.length - 1) && segs[segs.length - 1].eol === "";
  if (lastDropped && rest.length) rest[rest.length - 1] = { ...rest[rest.length - 1], eol: "" };
  return fromSegs(rest);
}
