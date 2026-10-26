// The project board: every numbered row of every table in BACKLOG.md, in three columns by status.
// Status `open`, `in spec NNN` or `done`; anything else counts as Open. Read-only: Claude changes a
// line's status as the work moves, so nothing here writes.

export type ColumnKey = "open" | "spec" | "done";

export const COLUMNS: { key: ColumnKey; name: string }[] = [
  { key: "open", name: "Open" },
  { key: "spec", name: "In spec" },
  { key: "done", name: "Done" },
];

export interface Step {
  id: string;
  description: string;
  passing: boolean;
}

export interface Card {
  n: number;
  idea: string;
  verdict: string;
  status: string; // as written
  spec: string | null; // "003" for `in spec 003`
  steps: Step[];
}

export interface Column {
  key: ColumnKey;
  name: string;
  cards: Card[];
}

/** A table row's cells, split on `|` that isn't escaped as `\|`, with `\|` turned back into `|`. */
export function cells(line: string): string[] | null {
  const t = line.trim();
  if (!t.startsWith("|")) return null;
  const out: string[] = [];
  let cur = "";
  for (let i = 1; i < t.length; i++) {
    const ch = t[i];
    if (ch === "\\" && t[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (ch === "|") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim()); // a row without a closing `|`
  return out;
}

const isDivider = (c: string[]) => c.length > 0 && c.every((x) => /^:?-+:?$/.test(x));

/** Where the number, idea, verdict and status sit, from a table's header row. */
function layoutOf(header: string[]) {
  const h = header.map((x) => x.toLowerCase());
  const find = (name: string, fallback: number) => {
    const i = h.indexOf(name);
    return i >= 0 ? i : fallback;
  };
  const n = find("#", 0);
  const verdict = find("verdict", 3);
  const status = find("status", header.length - 1);
  const known = new Set(["#", "date", "verdict", "reason", "source", "status"]);
  let idea = h.findIndex((x) => !known.has(x));
  if (idea < 0) idea = 2;
  return { n, idea, verdict, status };
}

export function columnOf(status: string): { key: ColumnKey; spec: string | null } {
  const s = status.trim().toLowerCase();
  const m = /^in spec (\d+)$/.exec(s);
  if (m) return { key: "spec", spec: m[1] };
  return { key: s === "done" ? "done" : "open", spec: null };
}

export function parseBacklogBoard(src: string): Column[] {
  const cols: Column[] = COLUMNS.map((c) => ({ ...c, cards: [] }));
  let layout: ReturnType<typeof layoutOf> | null = null;
  let prev: string[] | null = null;
  let fence = false;
  for (const line of src.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const c = fence ? null : cells(line);
    if (!c) {
      layout = null;
      prev = null;
      continue;
    }
    if (isDivider(c)) {
      if (prev) layout = layoutOf(prev);
      prev = null;
      continue;
    }
    prev = c;
    if (!layout || !/^\d+$/.test(c[layout.n] ?? "")) continue;
    const status = c[layout.status] ?? "";
    const { key, spec } = columnOf(status);
    cols.find((x) => x.key === key)!.cards.push({ n: Number(c[layout.n]), idea: c[layout.idea] ?? "", verdict: c[layout.verdict] ?? "", status, spec, steps: [] });
  }
  return cols;
}

/** The steps in features.json whose spec is `specs/NNN-*.md`, for each in-spec card. A file that isn't valid JSON adds none. */
export function attachSteps(cols: Column[], featuresJson: string | null) {
  let steps: any[] = [];
  try {
    const parsed = featuresJson ? JSON.parse(featuresJson) : null;
    if (Array.isArray(parsed?.steps)) steps = parsed.steps;
  } catch {
    steps = [];
  }
  for (const card of cols.find((c) => c.key === "spec")!.cards) {
    const re = new RegExp(`^specs/${card.spec}-[^/]*\\.md$`);
    card.steps = steps
      .filter((s) => typeof s?.spec === "string" && re.test(s.spec.replace(/\\/g, "/")))
      .map((s) => ({ id: String(s.id ?? ""), description: String(s.description ?? ""), passing: s.status === "passing" }));
  }
  return cols;
}
