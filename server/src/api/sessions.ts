import { Hono } from "hono";
import { join } from "node:path";
import { indexSessions, listSessions, sessionById, untitled, type IndexedSession } from "../db/index";
import { emit } from "../events";
import { readState, trashItem, writeState } from "../fs/archive";
import { isInside, tildify, untildify } from "../fs/paths";
import { WriteError } from "../fs/safeWrite";
import { TurnBuilder } from "../parsers/transcript";
import { readLines } from "../fs/lines";
import { getSession, knownCommands, listLive, removeSession, startSession, waitingCount } from "../live/sessions";
import { globalLibrary, projectLibrary } from "../scan/library";
import { listJobs, listLiveProcesses } from "../scan/jobs";
import { listProjects, projectDir, projectPathOf } from "../scan/projects";
import { ls, readJson } from "../scan/md";
import type { Env } from "./env";

export const sessions = new Hono<Env>();

const UUID = /^[0-9a-f-]{36}$/i;

function publicSession(s: IndexedSession, archived: Record<string, string>, running: Set<string>, projectOf: (cwd: string | null) => string | null) {
  const { file, ...rest } = s;
  return {
    ...rest,
    displayTitle: s.title ?? untitled(s.firstPrompt),
    cwd: s.cwd ? tildify(s.cwd) : null,
    project: projectOf(s.cwd),
    archivedAt: archived[s.sessionId] ?? null,
    running: running.has(s.sessionId),
    resumeCommand: s.cwd ? `cd "${s.cwd}" && claude --resume ${s.sessionId}` : `claude --resume ${s.sessionId}`,
  };
}

async function context() {
  const [state, procs, projects] = await Promise.all([readState(), listLiveProcesses(), listProjects()]);
  const running = new Set(procs.map((p) => p.sessionId));
  for (const l of listLive()) if (l.sessionId && l.status !== "stopped") running.add(l.sessionId);
  const dirs = projects.map((p) => ({ id: p.id, dir: untildify(p.id) }));
  const projectOf = (cwd: string | null) => (cwd ? dirs.find((d) => isInside(projectPathOf(cwd), d.dir))?.id ?? null : null);
  return { archived: state.archivedSessions, running, projectOf, state };
}

sessions.get("/sessions", async (c) => {
  const showArchived = c.req.query("archived") === "1";
  const includeEmpty = c.req.query("empty") === "1";
  const project = c.req.query("project");
  const { archived, running, projectOf } = await context();
  const list = listSessions()
    .filter((s) => includeEmpty || s.prompts > 0)
    .filter((s) => (showArchived ? !!archived[s.sessionId] : !archived[s.sessionId]))
    .map((s) => publicSession(s, archived, running, projectOf))
    .filter((s) => !project || s.project === project);
  return c.json(list);
});

sessions.get("/sessions/:sid", async (c) => {
  const sid = c.req.param("sid");
  if (!UUID.test(sid)) throw new WriteError(400, "That isn't a valid session link.");
  const s = sessionById(sid);
  if (!s) throw new WriteError(404, "No such session.");
  const { archived, running, projectOf } = await context();
  // Turns come in pages so long sessions open quickly; the client asks for more with ?offset=.
  const offset = Math.max(0, Number(c.req.query("offset") ?? 0) || 0);
  const limit = Math.min(1000, Math.max(1, Number(c.req.query("limit") ?? 200) || 200));
  const builder = new TurnBuilder();
  for await (const line of readLines(s.file)) builder.push(line);
  const subDir = join(s.file.replace(/\.jsonl$/, ""), "subagents");
  const subagents = [];
  for (const f of (await ls(subDir)).filter((f) => f.endsWith(".meta.json"))) {
    const meta = await readJson<Record<string, any>>(join(subDir, f));
    subagents.push({ agentId: f.replace(/^agent-/, "").replace(/\.meta\.json$/, ""), type: meta?.agentType ?? null, description: meta?.description ?? null });
  }
  return c.json({
    ...publicSession(s, archived, running, projectOf),
    turns: builder.turns.slice(offset, offset + limit),
    totalTurns: builder.turns.length,
    offset,
    subagentList: subagents,
  });
});

sessions.get("/sessions/:sid/subagents/:agentId", async (c) => {
  const { sid, agentId } = c.req.param();
  if (!UUID.test(sid) || !/^[\w-]+$/.test(agentId)) throw new WriteError(400, "That isn't a valid link to a helper run.");
  const s = sessionById(sid);
  if (!s) throw new WriteError(404, "No such session.");
  const file = join(s.file.replace(/\.jsonl$/, ""), "subagents", `agent-${agentId}.jsonl`);
  if (!(await Bun.file(file).exists())) throw new WriteError(404, "No such subagent run.");
  // Subagent transcripts mark every line as a sidechain; show them as a normal conversation.
  const builder = new TurnBuilder(true);
  for await (const line of readLines(file)) builder.push(line);
  return c.json({ turns: builder.turns });
});

sessions.post("/sessions/archive", async (c) => {
  const { ids, archived } = (await c.req.json()) as { ids: string[]; archived: boolean };
  const st = await readState();
  for (const id of ids) {
    if (!UUID.test(id)) continue;
    if (archived) st.archivedSessions[id] = new Date().toISOString();
    else delete st.archivedSessions[id];
  }
  await writeState(st);
  emit({ area: "sessions" });
  return c.json({ ok: true, count: ids.length });
});

sessions.post("/sessions/delete", async (c) => {
  const { ids } = (await c.req.json()) as { ids: string[] };
  const { running } = await context();
  const done: string[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const id of ids) {
    const s = UUID.test(id) ? sessionById(id) : null;
    if (!s) {
      skipped.push({ id, reason: "not found" });
      continue;
    }
    if (running.has(id)) {
      skipped.push({ id, reason: "still running" });
      continue;
    }
    await trashItem(s.file, { allowApp: true });
    await trashItem(s.file.replace(/\.jsonl$/, ""), { allowApp: true }).catch(() => {}); // subagents and tool results, if any
    done.push(id);
  }
  const st = await readState();
  for (const id of done) delete st.archivedSessions[id];
  await writeState(st);
  await indexSessions();
  emit({ area: "sessions" });
  return c.json({ deleted: done, skipped });
});

// ---- Jobs ----

sessions.get("/jobs", async (c) => c.json({ jobs: await listJobs(false), processes: await listLiveProcesses() }));
sessions.get("/jobs/:id", async (c) => {
  const id = c.req.param("id");
  const job = (await listJobs(true)).find((j) => j.id === id);
  if (!job) throw new WriteError(404, "No such job.");
  return c.json(job);
});

// ---- Overview ----

/** A background session stopped by a usage limit more than a day ago; limits reset within hours. */
export function isStaleLimit(j: { detail: string | null; updatedAt: string | null }, now = Date.now()) {
  return /limit/i.test(j.detail ?? "") && !!j.updatedAt && now - Date.parse(j.updatedAt) > 24 * 3600_000;
}

sessions.get("/overview", async (c) => {
  const jobs = await listJobs(false);
  const live = listLive();
  const named = (j: (typeof jobs)[number]) => j.name ?? `Session in ${j.cwd ? j.cwd.split(/[\\/]/).filter(Boolean).pop() : "an unknown folder"}`;
  const blocked = jobs.filter((j) => j.state === "blocked");
  const needsYou = [
    ...live.filter((l) => l.pending.length).map((l) => ({ type: "live" as const, id: l.id, cwd: l.cwd, request: l.pending[0], at: l.pending[0].at })),
    ...blocked.filter((j) => !isStaleLimit(j)).map((j) => ({ type: "job" as const, id: j.id, name: named(j), cwd: j.cwd, detail: j.detail, sessionId: j.sessionId, at: j.updatedAt })),
  ];
  // Stopped by a usage limit that has long since reset: nothing to answer, just something to continue.
  const paused = blocked.filter((j) => isStaleLimit(j)).map((j) => ({ id: j.id, name: named(j), cwd: j.cwd, sessionId: j.sessionId, at: j.updatedAt }));
  return c.json({
    needsYou,
    paused,
    live: live.filter((l) => l.status !== "stopped").length,
    waiting: waitingCount(),
  });
});

// ---- Live sessions ----

sessions.get("/live", (c) => c.json(listLive()));

/** Commands a new session will accept: your skills and commands, plus Claude Code's own from the last session that ran. */
sessions.get("/live-commands", async (c) => {
  const proj = c.req.query("project");
  const dir = proj ? await projectDir(proj) : null;
  const lib = [...(await globalLibrary()).items, ...(dir ? await projectLibrary(dir) : [])];
  const out = new Map<string, { name: string; description: string; argumentHint: string }>();
  for (const k of await knownCommands()) out.set(k.name, k);
  for (const i of lib) {
    if ((i.kind !== "skill" && i.kind !== "command") || i.state === "off") continue;
    const base = (i.folder ? i.folder.split(/[\\/]/).filter(Boolean).pop()! : i.name).replace(/\.md$/, "");
    const name = i.source === "plugin" ? `${i.sourceName}:${base}` : base;
    if (!out.has(name)) out.set(name, { name, description: i.description, argumentHint: String(i.meta?.["argument-hint"] ?? "") });
  }
  return c.json([...out.values()].sort((a, b) => a.name.localeCompare(b.name)));
});

sessions.post("/live", async (c) => {
  const body = await c.req.json();
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) throw new WriteError(400, "Write a first message for Claude.");
  let cwd: string | null = null;
  let resume: string | null = null;
  if (body.resume) {
    const s = UUID.test(body.resume) ? sessionById(body.resume) : null;
    if (!s?.cwd) throw new WriteError(404, "Can't find that session's folder.");
    cwd = s.cwd;
    resume = s.sessionId;
  } else {
    cwd = await projectDir(String(body.project ?? ""));
  }
  if (!cwd) throw new WriteError(400, "Pick a project to run in.");
  const allowed = ["default", "acceptEdits", "plan", "auto", "dontAsk"];
  const permissionMode = allowed.includes(body.permissionMode) ? body.permissionMode : "default";
  return c.json(startSession({ cwd, prompt, model: body.model || null, permissionMode, resume }));
});

function live(id: string) {
  const s = getSession(id);
  if (!s) throw new WriteError(404, "That live session has ended.");
  return s;
}

sessions.get("/live/:id", (c) => c.json(live(c.req.param("id")).view()));
sessions.post("/live/:id/send", async (c) => {
  const { text } = await c.req.json();
  if (!String(text ?? "").trim()) throw new WriteError(400, "Empty message.");
  live(c.req.param("id")).send(String(text));
  return c.json({ ok: true });
});
sessions.post("/live/:id/respond", async (c) => {
  const b = await c.req.json();
  try {
    live(c.req.param("id")).respond(b.requestId, { decision: b.decision, message: b.message, answers: b.answers });
  } catch (e: any) {
    throw new WriteError(409, e.message);
  }
  return c.json({ ok: true });
});
sessions.post("/live/:id/interrupt", async (c) => {
  await live(c.req.param("id")).interrupt();
  return c.json({ ok: true });
});
sessions.post("/live/:id/mode", async (c) => {
  const { mode } = await c.req.json();
  await live(c.req.param("id")).setMode(mode);
  return c.json({ ok: true });
});
sessions.delete("/live/:id", (c) => {
  removeSession(c.req.param("id"));
  return c.json({ ok: true });
});
