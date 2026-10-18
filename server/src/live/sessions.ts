import { query, type PermissionMode, type PermissionResult, type Query, type SDKMessage, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { emit } from "../events";
import { appDir, tildify } from "../fs/paths";
import { toolSummary } from "../parsers/transcript";

// Sessions started from the browser. Each one runs the Agent SDK in streaming-input mode so
// follow-ups, interrupts and permission-mode changes work, and routes every approval and
// AskUserQuestion through `canUseTool` to the browser.

export type LiveStatus = "starting" | "working" | "waiting" | "idle" | "error" | "stopped";

export type LiveEvent =
  | { kind: "user"; text: string; at: string }
  | { kind: "text"; text: string; at: string }
  | { kind: "tool"; id: string; name: string; summary: string; at: string; result?: string; isError?: boolean }
  | { kind: "result"; at: string; costUSD: number | null; isError: boolean; text: string | null }
  | { kind: "error"; at: string; text: string };

export interface PendingRequest {
  requestId: string;
  type: "approval" | "question";
  toolName: string;
  summary: string;
  input: Record<string, unknown>;
  canAlwaysAllow: boolean;
  at: string;
}

interface Waiter {
  req: PendingRequest;
  suggestions: unknown[];
  resolve: (r: PermissionResult) => void;
}

export interface LiveSessionView {
  id: string;
  sessionId: string | null;
  cwd: string;
  model: string | null;
  permissionMode: PermissionMode;
  status: LiveStatus;
  startedAt: string;
  events: LiveEvent[];
  pending: PendingRequest[];
  commands: { name: string; description: string; argumentHint: string }[];
}

class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private waiting: ((r: IteratorResult<T>) => void) | null = null;
  private closed = false;
  push(v: T) {
    if (this.waiting) {
      this.waiting({ value: v, done: false });
      this.waiting = null;
    } else this.items.push(v);
  }
  close() {
    this.closed = true;
    this.waiting?.({ value: undefined as never, done: true });
  }
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.items.length) return Promise.resolve({ value: this.items.shift()!, done: false });
        if (this.closed) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise((r) => (this.waiting = r));
      },
    };
  }
}

const now = () => new Date().toISOString();
const compiled = import.meta.path.includes("$bunfs") || /^[A-Z]:[\\/]~BUN/.test(import.meta.path);

/**
 * The installed Claude Code, for the compiled executable (which has no node_modules copy of it).
 * Started from Finder or at login the app may not have the shell's PATH, so the usual install folders are tried too.
 */
export function findClaude(): string | null {
  const onPath = Bun.which("claude");
  if (onPath) return onPath;
  const home = homedir();
  const candidates =
    process.platform === "win32"
      ? [join(home, ".local", "bin", "claude.exe"), join(process.env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "Programs", "claude", "claude.exe")]
      : [join(home, ".local", "bin", "claude"), join(home, ".claude", "local", "claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude"];
  return candidates.find((p) => existsSync(p)) ?? null;
}

function claudeExecutable(): string | undefined {
  if (!compiled) return undefined; // running from source: the SDK uses its own bundled copy
  const p = findClaude();
  if (!p) throw new Error("Claude Code isn't installed, or the app can't find it. Install Claude Code, or start the app from a terminal where `claude` works.");
  return p;
}

class LiveSession {
  id = crypto.randomUUID();
  sessionId: string | null = null;
  status: LiveStatus = "starting";
  startedAt = now();
  events: LiveEvent[] = [];
  waiters = new Map<string, Waiter>();
  input = new AsyncQueue<SDKUserMessage>();
  q: Query;
  abort = new AbortController();
  toolIndex = new Map<string, Extract<LiveEvent, { kind: "tool" }>>();
  // Slash commands this session accepts, from Claude Code itself. Terminal-only ones (exit, statusline…) are left out.
  commands: LiveSessionView["commands"] = [];
  terminalOnly = new Set<string>();

  constructor(
    public cwd: string,
    public model: string | null,
    public permissionMode: PermissionMode,
    resume: string | null,
  ) {
    this.q = query({
      prompt: this.input,
      options: {
        cwd,
        model: model ?? undefined,
        permissionMode,
        resume: resume ?? undefined,
        abortController: this.abort,
        settingSources: ["user", "project", "local"],
        pathToClaudeCodeExecutable: claudeExecutable(),
        canUseTool: (toolName, input, opts) => this.ask(toolName, input, opts as any),
      },
    });
    void this.pump();
  }

  view(): LiveSessionView {
    return {
      id: this.id,
      sessionId: this.sessionId,
      cwd: tildify(this.cwd),
      model: this.model,
      permissionMode: this.permissionMode,
      status: this.status,
      startedAt: this.startedAt,
      events: this.events,
      pending: [...this.waiters.values()].map((w) => w.req),
      commands: this.commands,
    };
  }

  setCommands(list: { name: string; description: string; argumentHint: string }[]) {
    this.commands = list
      .filter((c) => !this.terminalOnly.has(c.name))
      .map((c) => ({ name: c.name, description: c.description ?? "", argumentHint: c.argumentHint ?? "" }))
      .sort((a, b) => a.name.localeCompare(b.name));
    rememberCommands(this.commands);
    this.changed();
  }

  private changed() {
    emit({ area: "live", data: { id: this.id } });
  }

  private setStatus(s: LiveStatus) {
    this.status = s;
    this.changed();
  }

  send(text: string) {
    this.events.push({ kind: "user", text, at: now() });
    this.input.push({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null });
    this.setStatus(this.waiters.size ? "waiting" : "working");
  }

  private ask(toolName: string, input: Record<string, unknown>, opts: { requestId?: string; toolUseID?: string; suggestions?: unknown[]; suppressAlwaysAllowRule?: boolean; signal?: AbortSignal }): Promise<PermissionResult> {
    const requestId = opts.requestId ?? opts.toolUseID ?? crypto.randomUUID();
    const isQuestion = toolName === "AskUserQuestion";
    const req: PendingRequest = {
      requestId,
      type: isQuestion ? "question" : "approval",
      toolName,
      summary: toolSummary(toolName, input),
      input,
      canAlwaysAllow: !isQuestion && !opts.suppressAlwaysAllowRule && !!opts.suggestions?.length,
      at: now(),
    };
    return new Promise((resolve) => {
      this.waiters.set(requestId, { req, suggestions: opts.suggestions ?? [], resolve });
      opts.signal?.addEventListener("abort", () => {
        this.waiters.delete(requestId);
        this.changed();
      });
      this.setStatus("waiting");
    });
  }

  respond(requestId: string, r: { decision: "allow" | "always" | "deny"; message?: string; answers?: Record<string, string | string[]> }) {
    const w = this.waiters.get(requestId);
    if (!w) throw new Error("That request is no longer waiting.");
    this.waiters.delete(requestId);
    const input = w.req.input;
    let result: PermissionResult;
    if (w.req.type === "question") {
      result = r.decision === "deny"
        ? { behavior: "deny", message: r.message || "The user dismissed the question." }
        : { behavior: "allow", updatedInput: { ...input, questions: input.questions, answers: r.answers ?? {} } };
    } else if (r.decision === "deny") {
      result = { behavior: "deny", message: r.message || "The user denied this action." };
    } else if (r.decision === "always") {
      const persist = (w.suggestions as any[]).filter((s) => s.destination === "localSettings");
      result = { behavior: "allow", updatedInput: input, updatedPermissions: persist as any };
    } else {
      result = { behavior: "allow", updatedInput: input };
    }
    w.resolve(result);
    this.setStatus(this.waiters.size ? "waiting" : "working");
  }

  async interrupt() {
    await this.q.interrupt();
  }

  async setMode(mode: PermissionMode) {
    await this.q.setPermissionMode(mode);
    this.permissionMode = mode;
    this.changed();
  }

  stop() {
    for (const w of this.waiters.values()) w.resolve({ behavior: "deny", message: "Session stopped.", interrupt: true });
    this.waiters.clear();
    this.input.close();
    this.abort.abort();
    this.setStatus("stopped");
  }

  private handle(m: SDKMessage) {
    const at = now();
    if ("session_id" in m && m.session_id && !this.sessionId) this.sessionId = m.session_id;
    if (m.type === "system" && (m as any).subtype === "commands_changed") {
      this.setCommands((m as any).commands ?? []);
      return;
    }
    if (m.type === "system" && (m as any).subtype === "init") {
      this.model = (m as any).model ?? this.model;
      this.terminalOnly = new Set((m as any).terminal_slash_commands ?? []);
      this.q.supportedCommands().then(
        (c) => this.setCommands(c),
        () => {},
      );
      this.setStatus(this.waiters.size ? "waiting" : "working");
      return;
    }
    if (m.type === "assistant") {
      for (const b of (m.message.content ?? []) as any[]) {
        if (b.type === "text" && b.text?.trim()) this.events.push({ kind: "text", text: b.text, at });
        if (b.type === "tool_use") {
          const ev = { kind: "tool" as const, id: b.id, name: b.name, summary: toolSummary(b.name, b.input), at };
          this.toolIndex.set(b.id, ev);
          this.events.push(ev);
        }
      }
      this.changed();
      return;
    }
    if (m.type === "user") {
      const c = (m.message as any).content;
      if (Array.isArray(c)) {
        for (const b of c) {
          const t = b.type === "tool_result" ? this.toolIndex.get(b.tool_use_id) : undefined;
          if (t) {
            t.result = (typeof b.content === "string" ? b.content : (b.content ?? []).map((x: any) => x.text ?? "").join("\n")).slice(0, 4000);
            t.isError = !!b.is_error;
          }
        }
        this.changed();
      }
      return;
    }
    if (m.type === "result") {
      const r = m as any;
      this.events.push({ kind: "result", at, costUSD: r.total_cost_usd ?? null, isError: !!r.is_error, text: r.subtype === "success" ? null : r.subtype });
      this.setStatus(this.waiters.size ? "waiting" : "idle");
    }
  }

  private async pump() {
    try {
      for await (const m of this.q) this.handle(m);
      if (this.status !== "stopped") this.setStatus("stopped");
    } catch (e: any) {
      if (this.status === "stopped") return;
      this.events.push({ kind: "error", at: now(), text: e?.message ?? String(e) });
      this.setStatus("error");
    }
  }
}

const sessions = new Map<string, LiveSession>();

export function startSession(o: { cwd: string; prompt: string; model?: string | null; permissionMode?: PermissionMode; resume?: string | null }) {
  const s = new LiveSession(o.cwd, o.model ?? null, o.permissionMode ?? "default", o.resume ?? null);
  sessions.set(s.id, s);
  s.send(o.prompt);
  return s.view();
}

export const getSession = (id: string) => sessions.get(id) ?? null;
export const listLive = () => [...sessions.values()].map((s) => s.view()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
export const waitingCount = () => [...sessions.values()].filter((s) => s.waiters.size > 0).length;

export function removeSession(id: string) {
  const s = sessions.get(id);
  if (!s) return;
  if (s.status !== "stopped") s.stop();
  sessions.delete(id);
  emit({ area: "live", data: { id } });
}

export function stopAll() {
  for (const s of sessions.values()) if (s.status !== "stopped") s.stop();
}

// The last full command list a session reported, kept so a new session's first message can offer them too.
const knownPath = () => join(appDir(), "commands.json");
let known: LiveSessionView["commands"] | null = null;

function rememberCommands(list: LiveSessionView["commands"]) {
  known = list;
  void Bun.write(knownPath(), JSON.stringify(list)).catch(() => {});
}

export async function knownCommands(): Promise<LiveSessionView["commands"]> {
  if (known) return known;
  try {
    known = JSON.parse(await Bun.file(knownPath()).text());
  } catch {
    known = [];
  }
  return known ?? [];
}
