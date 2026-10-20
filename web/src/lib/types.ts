export type Access = "edit" | "app" | "secret" | "outside";

export interface GitInfo {
  branch: string | null;
  dirty: number;
  lastCommitAt: string | null;
  remote: string | null;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  group: "root" | "other";
  empty: boolean;
  hasClaudeDir: boolean;
  isPlugin: boolean;
  docs: string[];
  backlog: { open: number; done: number; total: number } | null;
  sessions: number;
  lastSessionAt: string | null;
  git: GitInfo | null;
}

export interface BacklogItem {
  line: number;
  done: boolean | null;
  n: number | null;
  text: string;
}
/** PROGRESS.md read as Next / In progress / Done. */
export type ColumnKey = "next" | "progress" | "done";
export interface BoardCard {
  line: number;
  end: number;
  done: boolean | null;
  n: number | null;
  text: string;
  title: string;
  labels: string[];
}
export interface BoardColumn {
  key: ColumnKey;
  name: string;
  line: number | null;
  cards: BoardCard[];
}
export interface Board {
  path: string;
  hash: string;
  columns: BoardColumn[];
}

export interface BacklogSection {
  name: string;
  line: number;
  intro: string;
  items: BacklogItem[];
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface Session {
  sessionId: string;
  cwd: string | null;
  gitBranch: string | null;
  title: string | null;
  displayTitle: string;
  agentName: string | null;
  firstPrompt: string | null;
  firstAt: string | null;
  lastAt: string | null;
  model: string | null;
  prompts: number;
  assistantMessages: number;
  toolCalls: number;
  usage: Usage;
  costUSD: number | null;
  kind: string | null;
  projectDir: string;
  subagents: number;
  sizeBytes: number;
  project: string | null;
  archivedAt: string | null;
  running: boolean;
  resumeCommand: string;
  /** Saved when the app started the session; null for sessions started elsewhere. */
  account: SessionAccount | null;
}

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

export interface ProjectDetail extends Omit<Project, "sessions" | "backlog" | "docs"> {
  abs: string;
  backlog: { title: string | null; intro: string; sections: BacklogSection[]; numbered: boolean; checkboxes: boolean; hash: string; path: string; file: "BACKLOG.md" } | null;
  board: Board | null;
  context: { folder: string; claudeMd: { path: string; display: string; hash: string | null }; files: { name: string; path: string; size: number; imported: boolean }[] };
  changelog: { title: string | null; days: { date: string; line: number; entries: string[]; kinds: (string | null)[] }[]; keep: boolean; hash: string; path: string } | null;
  docs: { name: string; path: string }[];
  library: LibraryItem[];
  plans: { path: string; title: string; sessionId: string; sessionTitle: string; at: string | null; open: string[] }[];
  memory: LibraryItem[];
  mcpServers: { path: string; servers: { name: string; type: string; runs: string }[]; error?: string | null };
  worktreeInclude: { path: string; display: string; exists: boolean; access: string; patterns: string[] };
  worktrees: { name: string; path: string }[];
  sessions: (Session & { worktree: boolean })[];
}

/** ~/.claude/keybindings.json, as GET /settings returns it. A null action unbinds a default shortcut. */
export interface Keybindings {
  path: string;
  display: string;
  exists: boolean;
  access: string;
  error: string | null;
  blocks: { context: string; bindings: { key: string; action: string | null }[] }[];
}

/** One custom theme in ~/.claude/themes/, as GET /settings returns it. */
export interface Theme {
  slug: string;
  name: string;
  base: string | null;
  overrides: number;
  path: string;
  display: string;
  access: string;
  error: string | null;
}

export type Kind = "skill" | "agent" | "command" | "rule" | "output-style" | "hook" | "hook-def" | "settings" | "claude-md" | "plan" | "memory" | "plugin" | "mcp" | "scheduled-task" | "workflow";

export interface LibraryItem {
  kind: Kind;
  name: string;
  description: string;
  path: string;
  display: string;
  folder: string | null;
  source: "user" | "project" | "plugin" | "synced";
  sourceName: string | null;
  access: Access;
  state: "on" | "off" | "name-only" | "user-invocable-only" | null;
  overrideKey: string | null;
  mtime: number | null;
  error: string | null;
  meta: Record<string, any>;
  line?: number;
}

export interface Job {
  id: string;
  name: string | null;
  state: string;
  detail: string | null;
  needs: unknown;
  cwd: string | null;
  sessionId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  timeline: { at: string; state: string; detail?: string; text?: string }[];
}

export interface PendingRequest {
  requestId: string;
  type: "approval" | "question";
  toolName: string;
  summary: string;
  input: any;
  canAlwaysAllow: boolean;
  at: string;
}

export type LiveEvent =
  | { kind: "user"; text: string; at: string }
  | { kind: "text"; text: string; at: string }
  | { kind: "tool"; id: string; name: string; summary: string; at: string; result?: string; isError?: boolean }
  | { kind: "result"; at: string; costUSD: number | null; isError: boolean; text: string | null }
  | { kind: "error"; at: string; text: string };

export interface LiveSession {
  id: string;
  sessionId: string | null;
  cwd: string;
  model: string | null;
  permissionMode: string;
  status: "starting" | "working" | "waiting" | "idle" | "error" | "stopped";
  startedAt: string;
  events: LiveEvent[];
  pending: PendingRequest[];
  commands: SlashCommand[];
  account: SessionAccount | null;
}

export interface SlashCommand {
  name: string;
  description: string;
  argumentHint: string;
}

export interface FileData {
  path: string;
  display: string;
  dir: boolean;
  entries?: string[];
  content: string | null;
  hash: string | null;
  size: number;
  mtime: number;
  access: Access;
  tooBig: boolean;
}

export interface CatalogItem extends LibraryItem {
  projectId: string | null; // the project it applies to; null when it applies everywhere
  projectName: string | null;
}

export interface Catalog {
  items: CatalogItem[];
  projects: { id: string; name: string }[];
}

/** The account Claude Code uses, as `GET /api/account` sends it (picked fields only). */
export interface Account {
  /** null for a cloud provider, whose credentials Claude Code doesn't check up front. */
  loggedIn: boolean | null;
  method: string;
  methodName: string;
  provider: string;
  providerName: string;
  email: string | null;
  organization: string | null;
  plan: string | null;
  installed: boolean;
  problem: string | null;
}

/** The account a session the app started runs on (picked fields of the Agent SDK's accountInfo()). */
export interface SessionAccount {
  provider: string;
  providerName: string;
  email: string | null;
  organization: string | null;
  plan: string | null;
}
