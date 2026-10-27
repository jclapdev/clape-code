// The New session page (/sessions/new): what its address can fill in, and what the conversation page shows the
// moment the first message is sent, before the server has answered for the new session ID.

export type NewSessionSearch = { project?: string; prompt?: string; mode?: string };

const MODE_VALUES = ["default", "acceptEdits", "plan", "auto"];
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export function newSessionSearch(s: Record<string, unknown>): NewSessionSearch {
  return { project: str(s.project), prompt: str(s.prompt), mode: MODE_VALUES.includes(s.mode as string) ? (s.mode as string) : undefined };
}

/** The project to fill in: the one asked for, else the one with the latest session. */
export function pickProject<P extends { id: string; empty: boolean; lastSessionAt: string | null }>(projects: P[], asked?: string): string {
  if (asked && projects.some((p) => p.id === asked)) return asked;
  const usable = projects.filter((p) => !p.empty);
  const latest = [...usable].sort((a, b) => (b.lastSessionAt ?? "").localeCompare(a.lastSessionAt ?? ""))[0];
  return asked ?? latest?.id ?? "";
}

/** The conversation page's first page of data for a session started a moment ago. */
export function firstPage(o: { sessionId: string; liveId: string | null; project: string; prompt: string; model: string; permissionMode: string; at: string }) {
  const line = o.prompt.trim().split("\n")[0]!;
  return {
    sessionId: o.sessionId,
    cwd: "",
    project: o.project,
    displayTitle: line.length > 80 ? `${line.slice(0, 79)}…` : line,
    archived: false,
    turns: [{ uuid: "live-0", role: "user" as const, at: o.at, blocks: [{ kind: "text" as const, text: o.prompt.trim() }] }],
    totalTurns: 1,
    offset: 0,
    subagentList: [],
    status: "starting" as const,
    liveId: o.liveId,
    pending: [],
    model: o.model || null,
    permissionMode: o.permissionMode,
    commands: [],
  };
}

/**
 * A link that fills in the prompt (such as "Have Claude set it up") puts its prompt in the box, and the text you had
 * typed there is kept beside it instead of being lost. Returns the draft to keep: the typed text, joined after one
 * already kept, or the one already kept when there's nothing new to keep.
 */
export function keepDraft(typed: string | null, kept: string | null, linked: string | undefined): string | null {
  const t = typed?.trim() ? typed : null;
  if (linked === undefined || !t || t.trim() === linked.trim()) return kept;
  if (!kept?.trim()) return t;
  if (kept.includes(t)) return kept;
  return `${kept}\n\n${t}`;
}
