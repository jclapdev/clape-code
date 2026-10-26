// Prompts typed often enough to be worth a skill, counted from ~/.claude/history.jsonl.
import { basename, join } from "node:path";
import { listSessions } from "../db/index";
import { readLines } from "../fs/lines";
import { claudeDir } from "../fs/paths";
import { globalLibrary, projectLibrary } from "./library";
import { discoverProjectDirs } from "./projects";

export interface Suggestion {
  prompt: string;
  count: number;
}

const THRESHOLD = 3;
const MAX = 5;

/** The skill name a prompt becomes: lower case, spaces as hyphens. */
export const skillNameOf = (prompt: string) => prompt.trim().toLowerCase().replace(/\s+/g, "-");

/**
 * Counts typed prompts, ignoring capitals and trailing spaces. Skips commands ("/…") and one-word prompts.
 * Each habit shows as its most typed spelling, the latest one on a tie.
 */
export function countPrompts(displays: string[], skillNames: Set<string>): Suggestion[] {
  const groups = new Map<string, { count: number; spellings: Map<string, { n: number; last: number }> }>();
  displays.forEach((d, i) => {
    const text = d.trimEnd();
    if (!text.trim() || text.trimStart().startsWith("/") || !/\s/.test(text.trim())) return;
    const key = text.toLowerCase();
    const g = groups.get(key) ?? { count: 0, spellings: new Map() };
    const s = g.spellings.get(text) ?? { n: 0, last: 0 };
    g.spellings.set(text, { n: s.n + 1, last: i });
    g.count++;
    groups.set(key, g);
  });
  return [...groups.values()]
    .filter((g) => g.count >= THRESHOLD)
    .map((g) => ({ prompt: [...g.spellings].sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last)[0]![0], count: g.count }))
    .filter((s) => !skillNames.has(skillNameOf(s.prompt)))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX);
}

/** Folder names of your skills in ~/.claude and in every project, the names a new skill can't reuse. */
async function skillNames(): Promise<Set<string>> {
  const dirs = await discoverProjectDirs(listSessions());
  const items = [...(await globalLibrary()).items, ...(await Promise.all(dirs.map((d) => projectLibrary(d.dir)))).flat()];
  return new Set(items.filter((i) => i.kind === "skill" && i.source !== "plugin").map((i) => (i.folder ? basename(i.folder) : i.name)));
}

export async function suggestedPrompts(): Promise<Suggestion[]> {
  const file = join(claudeDir(), "history.jsonl");
  if (!(await Bun.file(file).exists())) return [];
  const displays: string[] = [];
  for await (const line of readLines(file)) {
    try {
      const d = JSON.parse(line)?.display;
      if (typeof d === "string") displays.push(d);
    } catch {
      // A half-written last line is skipped.
    }
  }
  return countPrompts(displays, await skillNames());
}
