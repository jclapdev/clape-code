// A Feedback note becomes a new `pending`, `open` row at the end of the `## Feedback` table in a BACKLOG.md.
// Every other line keeps its exact bytes, line endings and final newline included.
import { parseBacklogBoard } from "./backlogBoard";
import { fromSegs, insertLines, toSegs, type Seg } from "./eol";

const HEADING = "## Feedback";
const DEFAULT_TABLE = ["| # | Date | Idea (his words) | Verdict | Reason | Source | Status |", "|---|---|---|---|---|---|---|"];

/** The note as one table cell: line breaks become spaces and `|` is written `\|`. */
export const cellOf = (note: string) => note.trim().replace(/\s*(\r\n|\r|\n)\s*/g, " ").replace(/\|/g, "\\|");

const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const isRow = (s: Seg) => s.text.trimStart().startsWith("|");
const isBlank = (s: Seg) => !s.text.trim();

/** The template's lines above its table, and its table's header and divider. A missing template gives a plain title. */
function fromTemplate(template: string | null) {
  const lines = (template ?? "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trimStart().startsWith("|"));
  const head = (first < 0 ? lines : lines.slice(0, first)).slice();
  while (head.length && !head[head.length - 1].trim()) head.pop();
  const table = first >= 0 && lines[first + 1]?.trimStart().startsWith("|") ? [lines[first].trim(), lines[first + 1].trim()] : DEFAULT_TABLE;
  return { head: head.length ? head : ["# Backlog"], table };
}

/**
 * Add `note` to `src` (null when the file doesn't exist yet; it then starts from `template`'s lines above its table).
 * The number is the highest # in any table plus one.
 */
export function appendFeedback(src: string | null, note: string, when: Date, template: string | null = null): { text: string; n: number } {
  const t = fromTemplate(template);
  const base = src ?? t.head.join("\n") + "\n";
  const n = Math.max(0, ...parseBacklogBoard(base).flatMap((c) => c.cards.map((x) => x.n))) + 1;
  const row = `| ${n} | ${day(when)} | "${cellOf(note)}" | pending | | Feedback in Clape Code | open |`;

  const segs = toSegs(base);
  let fence = false;
  let heading = -1;
  segs.forEach((s, i) => {
    if (/^\s*(```|~~~)/.test(s.text)) fence = !fence;
    else if (!fence && s.text.trim() === HEADING) heading = i;
  });
  const lastFilled = (from: number, to: number) => {
    for (let i = to - 1; i >= from; i--) if (!isBlank(segs[i])) return i;
    return from - 1;
  };

  if (heading < 0) {
    const at = lastFilled(0, segs.length) + 1;
    insertLines(segs, at, [...(at > 0 ? [""] : []), HEADING, "", ...t.table, row]);
    return { text: fromSegs(segs), n };
  }
  let end = segs.findIndex((s, i) => i > heading && /^#{1,2} /.test(s.text));
  if (end < 0) end = segs.length;
  let lastRow = -1;
  for (let i = heading + 1; i < end; i++) if (isRow(segs[i])) lastRow = i;
  if (lastRow >= 0) insertLines(segs, lastRow + 1, [row]);
  else insertLines(segs, lastFilled(heading, end) + 1, ["", ...t.table, row]);
  return { text: fromSegs(segs), n };
}
