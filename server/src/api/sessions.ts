import { Hono } from "hono";
import { join } from "node:path";
import { indexSessions, listSessions, sessionById, untitled, type IndexedSession } from "../db/index";
import { emit } from "../events";
import { readState, trashItem, writeState } from "../fs/archive";
import { isInside, tildify, untildify } from "../fs/paths";
import { WriteError } from "../fs/safeWrite";
import { TurnBuilder } from "../parsers/transcript";
import { readLines } from "../fs/lines";
import { sessionAccounts, type SessionAccount } from "../account/sessions";
import { builtInCommands } from "../scan/commandsReference";
import { getSession, isOpen, listLive, liveBySessionId, removeSession, startSession, waitingCount, type LiveStatus } from "../live/sessions";
import { sessionCopies } from "../live/copies";
import { isFromScript, startedSessions } from "../live/started";
import { globalLibrary, planItem, projectLibrary } from "../scan/library";
import { planOfSession } from "../scan/plans";
import { listJobs, listLiveProcesses } from "../scan/jobs";
import { listProjects, projectDir, projectPathOf } from "../scan/projects";
import { ls, readJson } from "../scan/md";
import { suggestedPrompts } from "../scan/suggested";
import type { Env } from "./env";

export const sessions = new Hono<Env>();

const UUID = /^[0-9a-f-]{36}$/i;

type Ctx = Awaited<ReturnType<typeof context>>;

function publicSession(s: IndexedSession, { archived, running, activity, projectOf, accounts, started, copyOf }: Ctx) {
  // Every folder a session ran in is only for linking plans; the list would carry hundreds of paths.
  const { file, cwds, slugs, planVerdict, ...rest } = s;
  return {
    ...rest,
    displayTitle: s.title ?? untitled(s.firstPrompt),
    cwd: s.cwd ? tildify(s.cwd) : null,
    project: projectOf(s.cwd),
    archivedAt: archived[s.sessionId] ?? null,
    archived: !!archived[s.sessionId],
    fromScript: isFromScript(s.entrypoint, s.sessionId, started),
    running: running.has(s.sessionId),
    activity: activity.get(s.sessionId) ?? null,
    account: accounts[s.sessionId] ?? null,
    copyOf: copyOf(s.sessionId),
    resumeCommand: s.cwd ? `cd "${s.cwd}" && claude --resume ${s.sessionId}` : `claude --resume ${s.sessionId}`,
  };
}

/**
 * What the Sessions list labels: Claude working, or waiting for an answer. An idle or finished session has none.
 * A session started here knows its own state; a terminal or background process counts as working unless it says idle.
 */
export function sessionActivity(procs: { sessionId: string; status: string | null }[], live: { sessionId: string; status: LiveStatus; pending: unknown[] }[]) {
  const activity = new Map<string, "working" | "waiting">();
  for (const p of procs) if (p.status !== "idle") activity.set(p.sessionId, "working");
  for (const l of [...live].reverse()) {
    if (!l.sessionId) continue;
    if (l.pending.length || l.status === "waiting") activity.set(l.sessionId, "waiting");
    else if (l.status === "starting" || l.status === "working") activity.set(l.sessionId, "working");
    else activity.delete(l.sessionId);
  }
  return activity;
}

/** For a copy Clape Code made (#120): the conversation it copies, with that one's title. */
function originalOf(sid: string | null) {
  if (!sid) return null;
  const o = sessionById(sid);
  return { sessionId: sid, title: o ? (o.title ?? untitled(o.firstPrompt)) : null };
}

async function context() {
  const [state, procs, projects, accounts, started, copies] = await Promise.all([readState(), listLiveProcesses(), listProjects(), sessionAccounts(), startedSessions(), sessionCopies()]);
  const running = new Set(procs.map((p) => p.sessionId));
  const live = listLive();
  for (const l of live) if (l.sessionId && l.status !== "stopped") running.add(l.sessionId);
  const activity = sessionActivity(procs, live);
  const dirs = projects.map((p) => ({ id: p.id, dir: untildify(p.id) }));
  const projectOf = (cwd: string | null) => (cwd ? dirs.find((d) => isInside(projectPathOf(cwd), d.dir))?.id ?? null : null);
  return { archived: state.archivedSessions, running, activity, projectOf, state, accounts, started, copyOf: (sid: string) => originalOf(copies[sid] ?? liveBySessionId(sid)?.copyOf ?? null) };
}

sessions.get("/sessions", async (c) => {
  // archived=1: only archived sessions; archived=all: archived ones too.
  const archivedQ = c.req.query("archived");
  const includeEmpty = c.req.query("empty") === "1";
  const project = c.req.query("project");
  const ctx = await context();
  const { archived } = ctx;
  const list = listSessions()
    .filter((s) => includeEmpty || s.prompts > 0)
    .filter((s) => archivedQ === "all" || (archivedQ === "1" ? !!archived[s.sessionId] : !archived[s.sessionId]))
    .map((s) => publicSession(s, ctx))
    .filter((s) => !project || s.project === project);
  return c.json(list);
});

const PERMISSION_MODES = ["default", "acceptEdits", "plan", "auto", "dontAsk"];
const modeOf = (m: unknown) => (PERMISSION_MODES.includes(m as string) ? (m as any) : null);

function sidOf(c: { req: { param: (k: string) => string } }) {
  const sid = c.req.param("sid");
  if (!UUID.test(sid)) throw new WriteError(400, "That isn't a valid session link.");
  return sid;
}

/** The indexed transcript, re-indexing once when a session just started hasn't been seen yet. */
async function findSession(sid: string) {
  return sessionById(sid) ?? (liveBySessionId(sid) ? (await indexSessions(), sessionById(sid)) : null);
}

/**
 * What Claude is doing in a conversation now. Messages come only from the transcript, so this carries no events.
 * status: the live session's own, "running" when a terminal or background process has it open, otherwise "done".
 */
function liveState(sid: string, s: IndexedSession | null, running: Set<string>) {
  const l = liveBySessionId(sid)?.view() ?? null;
  return {
    status: l ? l.status : running.has(sid) ? "running" : "done",
    liveId: l?.id ?? null,
    pending: l?.pending ?? [],
    model: l?.model ?? s?.model ?? null,
    permissionMode: l?.permissionMode ?? null,
    commands: l?.commands ?? [],
  };
}

sessions.get("/sessions/:sid", async (c) => {
  const sid = sidOf(c);
  const s = await findSession(sid);
  const ctx = await context();
  if (!s) {
    // Started a moment ago: Claude Code hasn't written its transcript yet.
    const l = liveBySessionId(sid)?.view();
    if (!l) throw new WriteError(404, "No such session.");
    const first = l.events.find((e) => e.kind === "user");
    // The messages sent so far, until Claude Code records them.
    const turns = l.events.flatMap((e, i) => (e.kind === "user" ? [{ uuid: `live-${i}`, role: "user", at: e.at, blocks: [{ kind: "text", text: e.text }] }] : []));
    return c.json({
      sessionId: sid,
      cwd: l.cwd,
      project: ctx.projectOf(untildify(l.cwd)),
      displayTitle: untitled(first?.kind === "user" ? first.text : null),
      archived: !!ctx.archived[sid],
      fromScript: false,
      account: l.account,
      copyOf: ctx.copyOf(sid),
      plan: null,
      turns,
      totalTurns: turns.length,
      offset: 0,
      subagentList: [],
      ...liveState(sid, null, ctx.running),
    });
  }
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
  const planPath = await planOfSession(s);
  return c.json({
    ...publicSession(s, ctx),
    plan: planPath ? { path: planPath, title: (await planItem(planPath)).name } : null,
    turns: builder.turns.slice(offset, offset + limit),
    totalTurns: builder.turns.length,
    offset,
    subagentList: subagents,
    ...liveState(sid, s, ctx.running),
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

/** Starts a conversation in a project and returns its session ID, which is its address from then on. */
sessions.post("/sessions/new", async (c) => {
  const body = await c.req.json();
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) throw new WriteError(400, "Write a first message for Claude.");
  const cwd = await projectDir(String(body.project ?? ""));
  if (!cwd) throw new WriteError(400, "Pick a project to run in.");
  const v = startSession({ cwd, prompt, model: body.model || null, permissionMode: modeOf(body.permissionMode) ?? "default" });
  return c.json({ sessionId: v.sessionId, liveId: v.id });
});

/**
 * Sends to the running session, or resumes the conversation under the same session ID when Claude isn't running.
 * When another Claude Code has it open, resuming would mix both into one transcript (the sessions docs: "If you resume
 * the same session in two terminals without forking, messages from both interleave into one transcript"), so only
 * `copy` is accepted then: it continues in a copy with its own session ID, and returns the live session to follow.
 */
sessions.post("/sessions/:sid/send", async (c) => {
  const sid = sidOf(c);
  const body = await c.req.json();
  const text = String(body.text ?? "");
  if (!text.trim()) throw new WriteError(400, "Empty message.");
  if (body.copy) {
    const s = await findSession(sid);
    if (!s?.cwd) throw new WriteError(404, "Can't find that session's folder.");
    const v = startSession({ cwd: s.cwd, prompt: text, model: body.model || null, permissionMode: modeOf(body.permissionMode) ?? "default", resume: sid, fork: true });
    return c.json({ sessionId: null, liveId: v.id, resumed: false, copy: true });
  }
  const l = liveBySessionId(sid);
  if (!(l && isOpen(l)) && (await listLiveProcesses()).some((p) => p.sessionId === sid))
    throw new WriteError(409, "This conversation is open in another Claude Code window. Reply there, or send from here to continue in a copy.");
  if (l && isOpen(l)) {
    l.send(text);
    return c.json({ sessionId: sid, liveId: l.id, resumed: false });
  }
  const s = await findSession(sid);
  const cwd = s?.cwd ?? l?.cwd ?? null;
  if (!cwd) throw new WriteError(404, "Can't find that session's folder.");
  const v = startSession({ cwd, prompt: text, model: body.model || l?.model || null, permissionMode: modeOf(body.permissionMode) ?? l?.permissionMode ?? "default", resume: sid, transcriptPending: !s });
  return c.json({ sessionId: v.sessionId, liveId: v.id, resumed: true });
});

function running(sid: string) {
  const l = liveBySessionId(sid);
  if (!l || !isOpen(l)) throw new WriteError(409, "Claude isn't running in this conversation.");
  return l;
}

sessions.post("/sessions/:sid/respond", async (c) => {
  const l = running(sidOf(c));
  const b = await c.req.json();
  try {
    l.respond(b.requestId, { decision: b.decision, message: b.message, answers: b.answers });
  } catch (e: any) {
    throw new WriteError(409, e.message);
  }
  return c.json({ ok: true });
});
sessions.post("/sessions/:sid/interrupt", async (c) => {
  await running(sidOf(c)).interrupt();
  return c.json({ ok: true });
});
sessions.post("/sessions/:sid/mode", async (c) => {
  const l = running(sidOf(c));
  const mode = modeOf((await c.req.json()).mode);
  if (!mode) throw new WriteError(400, "That isn't a permission mode.");
  await l.setMode(mode);
  return c.json({ ok: true });
});
sessions.post("/sessions/:sid/model", async (c) => {
  const l = running(sidOf(c));
  const model = String((await c.req.json()).model ?? "");
  if (model && !/^[\w.[\]-]+$/.test(model)) throw new WriteError(400, "That isn't a model name.");
  await l.setModel(model || null);
  return c.json({ ok: true });
});
/** Ends Claude's process for this conversation. The transcript stays; sending again resumes it. */
sessions.post("/sessions/:sid/stop", (c) => {
  const l = liveBySessionId(sidOf(c));
  if (l && l.status !== "stopped") l.stop();
  return c.json({ ok: true });
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

/** A background session stopped by a usage limit more than a day ago: it asks nothing, so it is an ordinary session. */
export function isStaleLimit(j: { detail: string | null; updatedAt: string | null }, now = Date.now()) {
  return /limit/i.test(j.detail ?? "") && !!j.updatedAt && now - Date.parse(j.updatedAt) > 24 * 3600_000;
}

/** Live requests waiting for an answer, and background sessions blocked on you. */
async function needsYouNow() {
  const jobs = await listJobs(false);
  const live = listLive();
  const named = (j: (typeof jobs)[number]) => j.name ?? `Session in ${j.cwd ? j.cwd.split(/[\\/]/).filter(Boolean).pop() : "an unknown folder"}`;
  const blocked = jobs.filter((j) => j.state === "blocked");
  const needsYou = [
    ...live.filter((l) => l.pending.length).map((l) => ({ type: "live" as const, id: l.id, sessionId: l.sessionId, cwd: l.cwd, request: l.pending[0], at: l.pending[0].at })),
    ...blocked.filter((j) => !isStaleLimit(j)).map((j) => ({ type: "job" as const, id: j.id, name: named(j), cwd: j.cwd, detail: j.detail, sessionId: j.sessionId, at: j.updatedAt })),
  ];
  return { needsYou, live, jobs };
}

sessions.get("/overview", async (c) => {
  const { needsYou, live } = await needsYouNow();
  return c.json({
    needsYou,
    live: live.filter((l) => l.status !== "stopped").length,
    waiting: waitingCount(),
  });
});

/** At most this many conversations in each of the menu's lists; the rest are on Sessions. */
const MENU_MAX = 5;

interface MenuItem {
  sessionId: string | null;
  jobId: string | null;
  title: string;
  project: string | null;
  /** The original's session ID, only when this is a copy Clape Code made. */
  copyOf?: string;
}

/**
 * The main menu's conversations: the one you last sent a message in, the ones that need you and the ones Claude is
 * working in. Runs from scripts and archived conversations are left out, as on Sessions. Only ID, title and project.
 */
const copyField = (original: string | null | undefined) => (original ? { copyOf: original } : {});

sessions.get("/menu", async (c) => {
  const [ctx, { needsYou, jobs }] = await Promise.all([context(), needsYouNow()]);
  const list = listSessions().filter((s) => s.prompts > 0 && !ctx.archived[s.sessionId] && !isFromScript(s.entrypoint, s.sessionId, ctx.started));
  const byId = new Map(list.map((s) => [s.sessionId, s]));
  const jobName = new Map(jobs.flatMap((j) => (j.sessionId && j.name ? [[j.sessionId, j.name] as const] : [])));
  const projectOf = (cwd: string | null) => ctx.projectOf(cwd ? untildify(cwd) : null);
  const item = (s: IndexedSession): MenuItem => ({ sessionId: s.sessionId, jobId: null, title: jobName.get(s.sessionId) ?? s.title ?? untitled(s.firstPrompt), project: ctx.projectOf(s.cwd), ...copyField(ctx.copyOf(s.sessionId)?.sessionId) });
  const last = list.reduce<IndexedSession | null>((a, s) => ((s.lastPromptAt ?? "") > (a?.lastPromptAt ?? "") ? s : a), null);

  const seen = new Set<string>();
  const needs: MenuItem[] = [];
  const running: MenuItem[] = [];
  for (const n of needsYou) {
    const key = n.sessionId ?? `job:${n.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const s = n.sessionId ? byId.get(n.sessionId) : undefined;
    if (s) needs.push(item(s));
    else if (n.type === "job") needs.push({ sessionId: n.sessionId, jobId: n.id, title: n.name, project: projectOf(n.cwd) });
    else if (n.sessionId) needs.push({ sessionId: n.sessionId, jobId: null, title: "New conversation", project: projectOf(n.cwd) });
  }
  // Newest activity first.
  for (const s of list) {
    const a = ctx.activity.get(s.sessionId);
    if (!a || seen.has(s.sessionId)) continue;
    seen.add(s.sessionId);
    (a === "waiting" ? needs : running).push(item(s));
  }
  // A conversation started here that Claude Code hasn't written a transcript for yet.
  for (const [sid, a] of ctx.activity) {
    const fresh = seen.has(sid) || sessionById(sid) ? null : liveBySessionId(sid);
    if (!fresh) continue;
    seen.add(sid);
    (a === "waiting" ? needs : running).unshift({ sessionId: sid, jobId: null, title: "New conversation", project: projectOf(fresh.view().cwd), ...copyField(fresh.copyOf) });
  }
  return c.json({
    last: last ? item(last) : null,
    needsYou: needs.slice(0, MENU_MAX),
    needsYouMore: Math.max(0, needs.length - MENU_MAX),
    running: running.slice(0, MENU_MAX),
    runningMore: Math.max(0, running.length - MENU_MAX),
  });
});

/** Prompts typed 3 or more times that no skill covers yet: only the text and the count. */
sessions.get("/suggested", async (c) => c.json(await suggestedPrompts()));

// ---- Live sessions ----

sessions.get("/live", (c) => c.json(listLive()));

/** Commands a new session will accept: Claude Code's own (the docs' list and the last session's), plus your skills and commands. */
sessions.get("/live-commands", async (c) => {
  const proj = c.req.query("project");
  const dir = proj ? await projectDir(proj) : null;
  const lib = [...(await globalLibrary()).items, ...(dir ? await projectLibrary(dir) : [])];
  const out = new Map<string, { name: string; description: string; argumentHint: string; tag?: string }>();
  for (const k of await builtInCommands()) out.set(k.name, k);
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
  return c.json(startSession({ cwd, prompt, model: body.model || null, permissionMode: modeOf(body.permissionMode) ?? "default", resume }));
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
