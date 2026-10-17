// Claude Code session transcripts: one JSON object per line.
// Assistant replies are split across several lines that share `message.id`,
// each repeating the same `usage`, so usage is counted once per message id.
// Both readers below take one line at a time so large transcripts can be streamed.

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface SessionSummary {
  sessionId: string;
  cwd: string | null;
  gitBranch: string | null;
  title: string | null;
  agentName: string | null;
  firstPrompt: string | null;
  firstAt: string | null;
  lastAt: string | null;
  model: string | null;
  version: string | null;
  prompts: number;
  assistantMessages: number;
  toolCalls: number;
  usage: Usage;
  costUSD: number | null;
  continuedIn: string | null;
  kind: string | null; // e.g. "bg" for background jobs
  searchText: string; // prompts and Claude's replies in conversation order, capped, for search
}

/** Per-session cap on text sent to the search index. */
export const SEARCH_TEXT_CAP = 20000;

const emptyUsage = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

/** Text a person typed, or null for tool results, meta lines and command wrappers. */
export function promptTextOf(line: any): string | null {
  if (line.type !== "user" || line.isMeta || line.isCompactSummary || line.toolUseResult) return null;
  const c = line.message?.content;
  let text: string | null = null;
  if (typeof c === "string") text = c;
  else if (Array.isArray(c)) {
    if (c.some((b: any) => b.type === "tool_result")) return null;
    text = c.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n") || null;
  }
  if (!text) return null;
  const t = text.trim();
  // Slash-command plumbing and system reminders are not prompts.
  if (/^<(command-|local-command-|system-reminder|task-notification)/.test(t)) return null;
  return t;
}

const parse = (raw: string): any => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export class Summarizer {
  private s: SessionSummary;
  private seen = new Set<string>();
  private aiTitle: string | null = null;
  private customTitle: string | null = null;
  private text: string[] = [];
  private chars = 0;

  constructor(private fallbackId: string) {
    this.s = {
      sessionId: fallbackId,
      cwd: null,
      gitBranch: null,
      title: null,
      agentName: null,
      firstPrompt: null,
      firstAt: null,
      lastAt: null,
      model: null,
      version: null,
      prompts: 0,
      assistantMessages: 0,
      toolCalls: 0,
      usage: emptyUsage(),
      costUSD: null,
      continuedIn: null,
      kind: null,
      searchText: "",
    };
  }

  private addText(t: string) {
    if (this.chars >= SEARCH_TEXT_CAP) return;
    this.text.push(t);
    this.chars += t.length + 2;
  }

  push(raw: string) {
    const d = parse(raw);
    if (!d) return;
    const s = this.s;
    if (d.sessionId && s.sessionId === this.fallbackId) s.sessionId = d.sessionId;
    if (d.cwd && !s.cwd) s.cwd = d.cwd;
    if (d.gitBranch) s.gitBranch = d.gitBranch;
    if (d.version) s.version = d.version;
    if (d.sessionKind && !s.kind) s.kind = d.sessionKind;
    if (typeof d.timestamp === "string" && (d.type === "user" || d.type === "assistant")) {
      if (!s.firstAt) s.firstAt = d.timestamp;
      s.lastAt = d.timestamp;
    }
    switch (d.type) {
      case "ai-title":
        this.aiTitle = d.aiTitle ?? this.aiTitle;
        break;
      case "custom-title":
        this.customTitle = d.customTitle ?? this.customTitle;
        break;
      case "agent-name":
        s.agentName = d.agentName ?? s.agentName;
        break;
      case "continued-in":
        s.continuedIn = d.continuedInSessionId ?? s.continuedIn;
        break;
      case "cost-state":
        if (typeof d.totalCostUSD === "number") s.costUSD = d.totalCostUSD;
        break;
      case "user": {
        const p = promptTextOf(d);
        if (p) {
          s.prompts++;
          if (!s.firstPrompt) s.firstPrompt = p.slice(0, 500);
          this.addText(p);
        }
        break;
      }
      case "assistant": {
        const m = d.message;
        if (!m || m.model === "<synthetic>") break;
        if (m.model) s.model = m.model;
        if (Array.isArray(m.content)) {
          s.toolCalls += m.content.filter((b: any) => b.type === "tool_use").length;
          if (!d.isSidechain) for (const b of m.content) if (b.type === "text" && b.text?.trim()) this.addText(b.text.trim());
        }
        const key = m.id ?? d.requestId ?? d.uuid;
        if (key && !this.seen.has(key)) {
          this.seen.add(key);
          s.assistantMessages++;
          const u = m.usage;
          if (u) {
            s.usage.input += u.input_tokens ?? 0;
            s.usage.output += u.output_tokens ?? 0;
            s.usage.cacheRead += u.cache_read_input_tokens ?? 0;
            s.usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
          }
        }
        break;
      }
    }
  }

  result(): SessionSummary {
    return { ...this.s, title: this.customTitle ?? this.aiTitle, searchText: this.text.join("\n\n").slice(0, SEARCH_TEXT_CAP) };
  }
}

export function summarize(text: string, fallbackId: string): SessionSummary {
  const sum = new Summarizer(fallbackId);
  for (const raw of text.split("\n")) sum.push(raw);
  return sum.result();
}

// ---- Transcript viewer ----

export type TurnBlock =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool"; id: string; name: string; summary: string; input: unknown; result?: string; isError?: boolean };

export interface Turn {
  uuid: string;
  role: "user" | "assistant" | "system";
  at: string | null;
  model?: string;
  blocks: TurnBlock[];
}

/** One-line description of a tool call, for the collapsed view. */
export function toolSummary(name: string, input: any): string {
  if (!input || typeof input !== "object") return "";
  const v =
    input.command ?? input.file_path ?? input.pattern ?? input.url ?? input.query ?? input.description ?? input.prompt ?? input.skill ?? "";
  return String(v).replace(/\s+/g, " ").slice(0, 200);
}

const resultText = (c: any): string => {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((b) => (b.type === "text" ? b.text : `[${b.type}]`)).join("\n");
  return "";
};

/** Builds display turns line by line: merged assistant blocks, tool results attached to their calls. */
export class TurnBuilder {
  turns: Turn[] = [];
  private toolIndex = new Map<string, Extract<TurnBlock, { kind: "tool" }>>();
  private current: Turn | null = null;

  constructor(private includeSidechain = false) {}

  push(raw: string) {
    const d = parse(raw);
    if (!d || (d.isSidechain && !this.includeSidechain)) return;
    if (d.type === "assistant" && d.message) {
      const m = d.message;
      if (m.model === "<synthetic>" && !Array.isArray(m.content)) return;
      // Consecutive assistant lines form one turn until a person speaks.
      if (!this.current || this.current.role !== "assistant") {
        this.current = { uuid: d.uuid, role: "assistant", at: d.timestamp ?? null, model: m.model, blocks: [] };
        this.turns.push(this.current);
      }
      for (const b of m.content ?? []) {
        if (b.type === "text" && b.text?.trim()) this.current.blocks.push({ kind: "text", text: b.text });
        else if (b.type === "thinking" && b.thinking?.trim()) this.current.blocks.push({ kind: "thinking", text: b.thinking });
        else if (b.type === "tool_use") {
          const blk = { kind: "tool" as const, id: b.id, name: b.name, summary: toolSummary(b.name, b.input), input: b.input };
          this.toolIndex.set(b.id, blk);
          this.current.blocks.push(blk);
        }
      }
    } else if (d.type === "user" && d.message) {
      const c = d.message.content;
      if (Array.isArray(c)) {
        for (const b of c) {
          const t = b.type === "tool_result" ? this.toolIndex.get(b.tool_use_id) : undefined;
          if (t) {
            t.result = resultText(b.content).slice(0, 20000);
            t.isError = !!b.is_error;
          }
        }
      }
      const p = promptTextOf(d);
      if (p) {
        this.current = { uuid: d.uuid, role: "user", at: d.timestamp ?? null, blocks: [{ kind: "text", text: p }] };
        this.turns.push(this.current);
      }
    } else if (d.type === "system" && d.subtype === "compact_boundary") {
      this.turns.push({ uuid: d.uuid, role: "system", at: d.timestamp ?? null, blocks: [{ kind: "text", text: "Conversation compacted" }] });
      this.current = null;
    }
  }
}

export function toTurns(text: string, includeSidechain = false): Turn[] {
  const b = new TurnBuilder(includeSidechain);
  for (const raw of text.split("\n")) b.push(raw);
  return b.turns;
}
