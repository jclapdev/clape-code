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
