// BACKLOG.md: `##` sections holding `- [ ] N. text` items (checkbox and number both optional).
// Read-only: the project list counts open items with it.

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
