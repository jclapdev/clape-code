// Plans and the conversations that worked on them (spec 004). A conversation worked on a plan when one of its
// transcript lines has a `slug` equal to the plan's file name without `.md`, or an `attachment.planFilePath`
// equal to the plan's path. Both are recorded while transcripts are indexed (SessionSummary.slugs and .plans).
import { basename, join, resolve } from "node:path";
import { untitled, type IndexedSession } from "../db/index";
import { claudeDir, isInside } from "../fs/paths";
import { canRead } from "../fs/policy";
import { ls, readJson } from "./md";
import { projectPathOf } from "./projects";

export type PlanStatus = "approved" | "not-approved" | "draft";

export interface PlanConversation {
  sessionId: string;
  title: string;
  at: string | null;
}

export interface PlanLink {
  status: PlanStatus;
  project: { id: string; name: string } | null;
  conversations: PlanConversation[]; // newest first
}

export interface PlanProject {
  id: string;
  name: string;
  dir: string;
}

type Session = Pick<IndexedSession, "sessionId" | "cwd" | "title" | "firstPrompt" | "lastAt" | "plans" | "slugs" | "planVerdict"> & { cwds?: Record<string, number> };

const slugOf = (path: string) => basename(path).replace(/\.md$/, "");

/** Sessions that worked on a plan, newest first, one per session id. */
function sessionsOf(path: string, sessions: Session[]): Session[] {
  const slug = slugOf(path);
  const seen = new Map<string, Session>();
  for (const s of sessions) {
    if (!(s.slugs ?? []).includes(slug) && !(s.plans ?? []).includes(path)) continue;
    const prev = seen.get(s.sessionId);
    if (!prev || (s.lastAt ?? "") > (prev.lastAt ?? "")) seen.set(s.sessionId, s);
  }
  return [...seen.values()].sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
}

/**
 * The project a plan belongs to: the one whose folder holds the working folders of the most of its conversations
 * (a conversation that moved between projects counts for each), on a tie the one with the newest conversation, then
 * the one more of their transcript lines ran in. Folders in no listed project (such as ~/projects itself) don't count.
 */
function projectOf(mine: Session[], projects: PlanProject[]): PlanProject | null {
  const tally = new Map<PlanProject, { n: number; newest: string; lines: number }>();
  for (const s of mine) {
    const cwds: Record<string, number> = s.cwds && Object.keys(s.cwds).length ? s.cwds : s.cwd ? { [s.cwd]: 1 } : {};
    const here = new Map<PlanProject, number>();
    for (const [cwd, lines] of Object.entries(cwds)) {
      const p = projects.find((x) => isInside(projectPathOf(cwd), x.dir));
      if (p) here.set(p, (here.get(p) ?? 0) + lines);
    }
    for (const [p, lines] of here) {
      const t = tally.get(p) ?? { n: 0, newest: "", lines: 0 };
      t.n++;
      t.lines += lines;
      if ((s.lastAt ?? "") > t.newest) t.newest = s.lastAt ?? "";
      tally.set(p, t);
    }
  }
  let best: PlanProject | null = null;
  let bt = { n: 0, newest: "", lines: 0 };
  for (const [p, t] of tally) {
    if (t.n > bt.n || (t.n === bt.n && (t.newest > bt.newest || (t.newest === bt.newest && t.lines > bt.lines)))) {
      best = p;
      bt = t;
    }
  }
  return best;
}

/** The last ExitPlanMode answer across a plan's conversations; "draft" when Claude never asked. */
function statusOf(mine: Session[]): PlanStatus {
  let last: { status: PlanStatus; at: string } | null = null;
  for (const s of mine) {
    const v = s.planVerdict;
    if (v && (!last || (v.at ?? "") > last.at)) last = { status: v.status, at: v.at ?? "" };
  }
  return last?.status ?? "draft";
}

export function linkPlan(path: string, sessions: Session[], projects: PlanProject[]): PlanLink {
  const mine = sessionsOf(path, sessions);
  const p = projectOf(mine, projects);
  return {
    status: statusOf(mine),
    project: p ? { id: p.id, name: p.name } : null,
    conversations: mine.map((s) => ({ sessionId: s.sessionId, title: s.title ?? untitled(s.firstPrompt), at: s.lastAt })),
  };
}

/**
 * A project's own plans folder. The settings reference: "`plansDirectory` ... Claude Code resolves the path
 * relative to the project root. ... Default: unset, so Claude Code uses `~/.claude/plans`"; it may be set in any
 * settings file, so the project's local file wins over its shared file, which wins over yours. Only a folder inside
 * the project is read (BRIEF.md: no folders other than ~/.claude and the project folders).
 */
export async function plansDirOf(dir: string): Promise<string | null> {
  const files = [join(dir, ".claude", "settings.local.json"), join(dir, ".claude", "settings.json"), join(claudeDir(), "settings.json")];
  for (const f of files) {
    const v = (await readJson<{ plansDirectory?: unknown }>(f))?.plansDirectory;
    if (typeof v !== "string" || !v.trim()) continue;
    const abs = resolve(dir, v.trim());
    return isInside(abs, dir) && abs !== dir ? abs : null;
  }
  return null;
}

/** Every plan file: ~/.claude/plans, then each project's plansDirectory, each path once. */
export async function planFiles(projects: PlanProject[]): Promise<{ path: string; project: PlanProject | null }[]> {
  const out = new Map<string, PlanProject | null>();
  const add = async (dir: string, project: PlanProject | null) => {
    for (const f of await ls(dir)) if (f.endsWith(".md") && !out.has(join(dir, f))) out.set(join(dir, f), project);
  };
  await add(join(claudeDir(), "plans"), null);
  for (const p of projects) {
    const d = await plansDirOf(p.dir);
    if (d) await add(d, p);
  }
  return [...out].map(([path, project]) => ({ path, project }));
}

/**
 * The plan a conversation follows: the last plan file it wrote, else the file in ~/.claude/plans named after its
 * slug. Null when neither exists or can be read.
 */
export async function planOfSession(s: Pick<IndexedSession, "plans" | "slugs">): Promise<string | null> {
  const candidates = [...(s.plans ?? [])].reverse();
  for (const slug of [...(s.slugs ?? [])].reverse()) candidates.push(join(claudeDir(), "plans", `${slug}.md`));
  for (const p of candidates) if (canRead(p) && (await Bun.file(p).exists())) return p;
  return null;
}
