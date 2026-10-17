// BACKLOG.md: `##` sections holding `- [ ] N. text` items (checkbox and number both optional).
// Every edit changes only the lines it targets; all other bytes stay as they were.

export interface BacklogItem {
  line: number; // 0-based line index in the file
  done: boolean | null; // null when the item has no checkbox
  n: number | null;
  text: string;
}

export interface BacklogSection {
  name: string;
  line: number;
  intro: string;
  items: BacklogItem[];
}

export interface Backlog {
  title: string | null;
  intro: string;
  sections: BacklogSection[];
  numbered: boolean;
  checkboxes: boolean;
}

const ITEM = /^(\s*)[-*] (?:\[( |x|X)\] )?(?:(\d+)\. )?(.*)$/;

const splitLines = (text: string) => text.split(/\r?\n/);
const eolOf = (text: string) => (text.includes("\r\n") ? "\r\n" : "\n");

export function parseBacklog(text: string): Backlog {
  const lines = splitLines(text);
  const b: Backlog = { title: null, intro: "", sections: [], numbered: false, checkboxes: false };
  let sec: BacklogSection | null = null;
  const introLines: string[] = [];
  let secIntro: string[] = [];

  const root: BacklogSection = { name: "", line: -1, intro: "", items: [] };
  lines.forEach((l, i) => {
    if (/^# /.test(l) && b.title === null) {
      b.title = l.slice(2).trim();
      return;
    }
    if (/^## /.test(l)) {
      if (sec) sec.intro = secIntro.join("\n").trim();
      sec = { name: l.slice(3).trim(), line: i, intro: "", items: [] };
      secIntro = [];
      b.sections.push(sec);
      return;
    }
    const m = ITEM.exec(l);
    if (m && m[1] === "") {
      const item: BacklogItem = {
        line: i,
        done: m[2] === undefined ? null : m[2] !== " ",
        n: m[3] ? Number(m[3]) : null,
        text: m[4],
      };
      if (item.done !== null) b.checkboxes = true;
      if (item.n !== null) b.numbered = true;
      (sec ?? root).items.push(item);
      return;
    }
    if (sec) {
      if (sec.items.length === 0 && l.trim()) secIntro.push(l);
    } else if (l.trim()) introLines.push(l);
  });
  if (sec) (sec as BacklogSection).intro = secIntro.join("\n").trim();
  if (root.items.length) b.sections.unshift(root);
  b.intro = introLines.join("\n").trim();
  return b;
}

function itemAt(lines: string[], line: number) {
  const m = ITEM.exec(lines[line] ?? "");
  if (!m || m[1] !== "") throw new Error(`Line ${line + 1} is not a backlog item.`);
  return m;
}

export function toggleItem(text: string, line: number): string {
  const eol = eolOf(text);
  const lines = splitLines(text);
  const m = itemAt(lines, line);
  if (m[2] === undefined) throw new Error("This item has no checkbox.");
  lines[line] = lines[line].replace(/\[( |x|X)\]/, m[2] === " " ? "[x]" : "[ ]");
  return lines.join(eol);
}

export function editItemText(text: string, line: number, newText: string): string {
  const eol = eolOf(text);
  const lines = splitLines(text);
  const m = itemAt(lines, line);
  const prefix = lines[line].slice(0, lines[line].length - m[4].length);
  lines[line] = prefix + newText.replace(/\r?\n/g, " ").trim();
  return lines.join(eol);
}

/** Add an item at the end of a section (by heading line, or -1 for items before any heading). */
export function addItem(text: string, sectionLine: number, itemText: string): string {
  const eol = eolOf(text);
  const lines = splitLines(text);
  const b = parseBacklog(text);
  const sec = b.sections.find((s) => s.line === sectionLine);
  if (!sec) throw new Error("No such section.");
  const maxN = Math.max(0, ...b.sections.flatMap((s) => s.items.map((i) => i.n ?? 0)));
  const box = b.checkboxes ? "[ ] " : "";
  const num = b.numbered ? `${maxN + 1}. ` : "";
  const newLine = `- ${box}${num}${itemText.replace(/\r?\n/g, " ").trim()}`;

  let at: number;
  if (sec.items.length) at = sec.items[sec.items.length - 1].line + 1;
  else {
    // After the heading and its intro paragraph, before the next heading.
    const next = b.sections.find((s) => s.line > sec.line);
    let end = next ? next.line : lines.length;
    while (end > sec.line + 1 && !lines[end - 1].trim()) end--;
    at = end;
    if (lines[at - 1]?.trim() && !ITEM.test(lines[at - 1])) {
      lines.splice(at, 0, "");
      at++;
    }
  }
  lines.splice(at, 0, newLine);
  return lines.join(eol);
}
