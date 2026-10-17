import { Database } from "bun:sqlite";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { claudeDir, indexDbPath } from "../fs/paths";
import { readLines } from "../fs/lines";
import { Summarizer, type SessionSummary } from "../parsers/transcript";

// A rebuildable cache. Files on disk are the truth; deleting index.sqlite only costs a re-scan.
const SCHEMA_VERSION = 3; // 3: search text includes Claude's replies

let db: Database | null = null;

export function getDb(): Database {
  if (db) return db;
  mkdirSync(dirname(indexDbPath()), { recursive: true });
  db = new Database(indexDbPath(), { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  const v = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (v !== SCHEMA_VERSION) {
    db.exec("DROP TABLE IF EXISTS sessions; DROP TABLE IF EXISTS docs;");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      file TEXT PRIMARY KEY,
      size INTEGER NOT NULL,
      mtime REAL NOT NULL,
      session_id TEXT NOT NULL,
      project_dir TEXT NOT NULL,
      subagents INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_sid ON sessions(session_id);
    CREATE VIRTUAL TABLE IF NOT EXISTS docs USING fts5(
      kind UNINDEXED, ref UNINDEXED, title, subtitle, body, tokenize = 'unicode61'
    );
  `);
  return db;
}

export interface IndexedSession extends Omit<SessionSummary, "searchText"> {
  file: string;
  projectDir: string;
  subagents: number;
  sizeBytes: number;
}

/** A readable name for a session without a title: the first real line of its first prompt. */
export function untitled(firstPrompt: string | null): string {
  const line = (firstPrompt ?? "")
    .split("\n")
    .map((l) => l.replace(/<\/?[\w-]+>/g, "").replace(/^#+\s*/, "").trim())
    .find(Boolean);
  return line ? line.slice(0, 100) : "Untitled session";
}

function countSubagents(file: string): number {
  try {
    return readdirSync(join(file.replace(/\.jsonl$/, ""), "subagents")).filter((f) => f.endsWith(".jsonl")).length;
  } catch {
    return 0;
  }
}

/** Index every top-level transcript whose size or modified time changed. Returns how many were (re)read. */
export async function indexSessions(): Promise<number> {
  const d = getDb();
  const root = join(claudeDir(), "projects");
  let dirs: string[] = [];
  try {
    dirs = readdirSync(root).filter((n) => n.startsWith("-") || /^[A-Za-z]--/.test(n));
  } catch {
    return 0;
  }
  const known = new Map<string, { size: number; mtime: number }>();
  for (const r of d.query("SELECT file, size, mtime FROM sessions").all() as any[]) known.set(r.file, r);

  const seen = new Set<string>();
  const upsert = d.prepare(
    "INSERT OR REPLACE INTO sessions (file, size, mtime, session_id, project_dir, subagents, data) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const delDoc = d.prepare("DELETE FROM docs WHERE kind = 'session' AND ref = ?");
  const addDoc = d.prepare("INSERT INTO docs (kind, ref, title, subtitle, body) VALUES ('session', ?, ?, ?, ?)");
  let changed = 0;

  for (const dir of dirs) {
    let files: string[] = [];
    try {
      files = readdirSync(join(root, dir)).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const f of files) {
      const file = join(root, dir, f);
      seen.add(file);
      let st;
      try {
        st = statSync(file);
      } catch {
        continue;
      }
      const prev = known.get(file);
      const subagents = countSubagents(file);
      if (prev && prev.size === st.size && prev.mtime === st.mtimeMs) continue;
      const sum = new Summarizer(f.replace(/\.jsonl$/, ""));
      for await (const line of readLines(file)) sum.push(line);
      const s = sum.result();
      const { searchText, ...rest } = s;
      upsert.run(file, st.size, st.mtimeMs, s.sessionId, dir, subagents, JSON.stringify(rest));
      delDoc.run(file);
      addDoc.run(file, s.title ?? untitled(s.firstPrompt), s.cwd ?? dir, searchText);
      changed++;
    }
  }
  for (const file of known.keys()) {
    if (!seen.has(file)) {
      d.prepare("DELETE FROM sessions WHERE file = ?").run(file);
      delDoc.run(file);
    }
  }
  return changed;
}

export function listSessions(): IndexedSession[] {
  const rows = getDb().query("SELECT file, size, project_dir, subagents, data FROM sessions").all() as any[];
  return rows
    .map((r) => ({ ...JSON.parse(r.data), file: r.file, projectDir: r.project_dir, subagents: r.subagents, sizeBytes: r.size }))
    .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
}

export function sessionByFile(file: string): IndexedSession | null {
  const r = getDb().query("SELECT file, size, project_dir, subagents, data FROM sessions WHERE file = ?").get(file) as any;
  return r ? { ...JSON.parse(r.data), file: r.file, projectDir: r.project_dir, subagents: r.subagents, sizeBytes: r.size } : null;
}

export function sessionById(id: string): IndexedSession | null {
  const r = getDb().query("SELECT file FROM sessions WHERE session_id = ? LIMIT 1").get(id) as any;
  return r ? sessionByFile(r.file) : null;
}

// ---- Search documents for everything that isn't a session ----

export interface Doc {
  kind: string;
  ref: string;
  title: string;
  subtitle: string;
  body: string;
}

export function replaceDocs(docs: Doc[]) {
  const d = getDb();
  const tx = d.transaction((list: Doc[]) => {
    d.exec("DELETE FROM docs WHERE kind != 'session'");
    const ins = d.prepare("INSERT INTO docs (kind, ref, title, subtitle, body) VALUES (?, ?, ?, ?, ?)");
    for (const x of list) ins.run(x.kind, x.ref, x.title, x.subtitle, x.body.slice(0, 50000));
  });
  tx(docs);
}

export interface SearchHit {
  kind: string;
  ref: string;
  title: string;
  subtitle: string;
  snippet: string;
}

/** Prefix search over titles and bodies. Each word must match. */
export function search(q: string, limit = 40): SearchHit[] {
  const words = q
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter(Boolean)
    .map((w) => `"${w.replace(/"/g, "")}"*`);
  if (!words.length) return [];
  const match = words.join(" ");
  return getDb()
    .query(
      `SELECT kind, ref, title, subtitle, snippet(docs, 4, '[', ']', '…', 12) AS snippet
       FROM docs WHERE docs MATCH ?
       ORDER BY bm25(docs, 0, 0, 8.0, 2.0, 1.0) LIMIT ?`,
    )
    .all(match, limit) as SearchHit[];
}
