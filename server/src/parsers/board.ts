// The project board: three `##` sections of PROGRESS.md (Next, In progress, Done) read as kanban columns.
// Every other section, such as "Waiting for John" or "Notes", is left alone and isn't shown.
// A card is a top-level list item plus the indented lines under it. Each operation changes only the
// lines of the card it touches; every other line keeps its exact bytes, line ending included.
import { fromSegs, insertLines, toSegs, type Seg } from "./eol";

export type ColumnKey = "next" | "progress" | "done";

export const COLUMNS: { key: ColumnKey; name: string }[] = [
  { key: "next", name: "Next" },
  { key: "progress", name: "In progress" },
  { key: "done", name: "Done" },
];

export interface Card {
  line: number; // 0-based line of the item
  end: number; // last line of the card (the item plus its indented lines)
  done: boolean | null; // null when the item has no checkbox
  n: number | null;
  text: string; // as written, labels included
  title: string; // the text without its trailing #labels
  labels: string[];
}

export interface Column {
  key: ColumnKey;
  name: string;
  line: number | null; // heading line, null when the file has no such section
  cards: Card[];
}

const ITEM = /^[-*] (?:\[( |x|X)\] )?(?:(\d+)\. )?(.*)$/;
const LABELS = /(?:\s+#[A-Za-z][\w-]*)+\s*$/;

/** Which column a `##` heading is. Only these exact names count, in any letter case. */
export function columnOf(heading: string): ColumnKey | null {
  const h = heading.trim().replace(/:$/, "").toLowerCase();
  return h === "next" ? "next" : h === "in progress" ? "progress" : h === "done" ? "done" : null;
}

export function splitLabels(text: string): { title: string; labels: string[] } {
  const m = LABELS.exec(text);
  if (!m) return { title: text, labels: [] };
  return { title: text.slice(0, m.index).trimEnd(), labels: m[0].trim().split(/\s+/).map((l) => l.slice(1)) };
}

const isHeading = (t: string) => /^#{1,6} /.test(t);
const isContinuation = (t: string) => /^\s+\S/.test(t);

function parseSegs(segs: Seg[]): Column[] {
  const cols: Column[] = COLUMNS.map((c) => ({ ...c, line: null, cards: [] }));
  let cur: Column | null = null;
  let fence = false;
  for (let i = 0; i < segs.length; i++) {
    const t = segs[i].text;
    if (/^\s*(```|~~~)/.test(t)) fence = !fence;
    if (fence) continue;
    if (/^## /.test(t) || /^# /.test(t)) {
      const key = /^## /.test(t) ? columnOf(t.slice(3)) : null;
      const col = key ? cols.find((c) => c.key === key)! : null;
      // A second heading with the same name isn't read as a column again.
      cur = col && col.line === null ? col : null;
      if (cur) cur.line = i;
      continue;
    }
    if (!cur) continue;
    const m = ITEM.exec(t);
    if (!m) continue;
    let end = i;
    while (end + 1 < segs.length && isContinuation(segs[end + 1].text)) end++;
    const text = m[3];
    cur.cards.push({ line: i, end, done: m[1] === undefined ? null : m[1] !== " ", n: m[2] ? Number(m[2]) : null, text, ...splitLabels(text) });
    i = end;
  }
  return cols;
}

export const parseBoard = (src: string) => parseSegs(toSegs(src));

export const NEW_BOARD = "# Progress\n\n## Next\n\n## In progress\n\n## Done\n";

function cardAt(cols: Column[], line: number) {
  for (const col of cols) {
    const card = col.cards.find((c) => c.line === line);
    if (card) return { col, card };
  }
  throw new Error(`Line ${line + 1} is not a card on the board.`);
}

const oneLine = (s: string) => s.replace(/\r?\n/g, " ").trim();

/** Where content ends: before the empty line that ends a file with a newline. */
const contentEnd = (segs: Seg[]) => (segs[segs.length - 1].text === "" ? segs.length - 1 : segs.length);

/** Put a card's lines at the end of a column, adding the column's heading at the end of the file if it's missing. */
function placeInColumn(segs: Seg[], key: ColumnKey, lines: string[]) {
  const cols = parseSegs(segs);
  const col = cols.find((c) => c.key === key)!;
  if (col.line === null) {
    const end = contentEnd(segs);
    const before = end > 0 && segs[end - 1].text.trim() ? [""] : [];
    insertLines(segs, end, [...before, `## ${col.name}`, "", ...lines]);
    return;
  }
  if (col.cards.length) {
    insertLines(segs, col.cards[col.cards.length - 1].end + 1, lines);
    return;
  }
  // An empty column: after the heading and any intro, before the blank lines that lead to the next heading.
  let stop = segs.findIndex((s, i) => i > col.line! && isHeading(s.text));
  if (stop < 0) stop = contentEnd(segs);
  let at = stop;
  while (at > col.line + 1 && !segs[at - 1].text.trim()) at--;
  const out = [...lines];
  if (segs[at - 1].text.trim()) out.unshift("");
  if (at < contentEnd(segs) && segs[at].text.trim()) out.push("");
  insertLines(segs, at, out);
}

/** The style of new cards: like the column's own cards, else like any card on the board, else a checkbox. */
function styleFor(cols: Column[], key: ColumnKey) {
  const sample = cols.find((c) => c.key === key)!.cards[0] ?? cols.flatMap((c) => c.cards)[0];
  const box = !sample || sample.done !== null;
  const numbered = !!sample && sample.n !== null;
  const maxN = Math.max(0, ...cols.flatMap((c) => c.cards.map((x) => x.n ?? 0)));
  return { box, numbered, next: maxN + 1 };
}

export function addCard(src: string, key: ColumnKey, text: string): string {
  const body = oneLine(text);
  if (!body) throw new Error("A card needs some text.");
  const segs = toSegs(src);
  const s = styleFor(parseSegs(segs), key);
  const line = `- ${s.box ? (key === "done" ? "[x] " : "[ ] ") : ""}${s.numbered ? `${s.next}. ` : ""}${body}`;
  placeInColumn(segs, key, [line]);
  return fromSegs(segs);
}

export function editCard(src: string, line: number, text: string): string {
  const body = oneLine(text);
  if (!body) throw new Error("A card needs some text.");
  const segs = toSegs(src);
  const { card } = cardAt(parseSegs(segs), line);
  const t = segs[line].text;
  segs[line].text = t.slice(0, t.length - card.text.length) + body;
  return fromSegs(segs);
}

export function deleteCard(src: string, line: number): string {
  const segs = toSegs(src);
  const { col, card } = cardAt(parseSegs(segs), line);
  takeCard(segs, col, card);
  return fromSegs(segs);
}

/** Take a card out. When it was the column's only card, the blank line that placeInColumn put above it goes too. */
function takeCard(segs: Seg[], col: Column, card: Card) {
  const a = card.line;
  removeLines(segs, a, card.end);
  const blank = (i: number) => i >= segs.length || (!segs[i].text.trim() && (i < segs.length - 1 || segs[i].eol === ""));
  if (col.cards.length === 1 && a >= 2 && !segs[a - 1].text.trim() && blank(a)) segs.splice(a - 1, 1);
}

/** Take out lines a..b. If they ended the file, the line before now ends it, without an ending of its own. */
function removeLines(segs: Seg[], a: number, b: number) {
  const lastEol = segs[b].eol;
  segs.splice(a, b - a + 1);
  if (lastEol === "" && a > 0 && a === segs.length) segs[a - 1].eol = "";
}

/** Move a card to the end of another column. Moving into Done ticks its checkbox; moving out of Done unticks it. */
export function moveCard(src: string, line: number, to: ColumnKey): string {
  const segs = toSegs(src);
  const { col, card } = cardAt(parseSegs(segs), line);
  if (col.key === to) return src;
  const lines = segs.slice(card.line, card.end + 1).map((s) => s.text);
  if (card.done !== null && (to === "done") !== card.done) lines[0] = lines[0].replace(/^([-*] )\[( |x|X)\]/, `$1[${to === "done" ? "x" : " "}]`);
  takeCard(segs, col, card);
  placeInColumn(segs, to, lines);
  return fromSegs(segs);
}
