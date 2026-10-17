import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { indexSessions, listSessions, sessionById, untitled, type IndexedSession } from "../db/index";
import { emit } from "../events";
import { readState, trashItem, writeState } from "../fs/archive";
import { isInside, tildify, untildify } from "../fs/paths";
import { WriteError } from "../fs/safeWrite";
import { parseChangelog } from "../parsers/changelog";
import { toTurns } from "../parsers/transcript";
import { getSession, listLive, removeSession, startSession, waitingCount } from "../live/sessions";
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
  if (!UUID.test(sid)) throw new WriteError(400, "Bad session id.");
  const s = sessionById(sid);
  if (!s) throw new WriteError(404, "No such session.");
  const { archived, running, projectOf } = await context();
  const text = await readFile(s.file, "utf8");
  const subDir = join(s.file.replace(/\.jsonl$/, ""), "subagents");
  const subagents = [];
  for (const f of (await ls(subDir)).filter((f) => f.endsWith(".meta.json"))) {
    const meta = await readJson<Record<string, any>>(join(subDir, f));
    subagents.push({ agentId: f.replace(/^agent-/, "").replace(/\.meta\.json$/, ""), type: meta?.agentType ?? null, description: meta?.description ?? null });
  }
  return c.json({ ...publicSession(s, archived, running, projectOf), turns: toTurns(text), subagentList: subagents });
});

sessions.get("/sessions/:sid/subagents/:agentId", async (c) => {
  const { sid, agentId } = c.req.param();
  if (!UUID.test(sid) || !/^[\w-]+$/.test(agentId)) throw new WriteError(400, "Bad id.");
  const s = sessionById(sid);
  if (!s) throw new WriteError(404, "No such session.");
  const text = await readFile(join(s.file.replace(/\.jsonl$/, ""), "subagents", `agent-${agentId}.jsonl`), "utf8").catch(() => null);
  if (text === null) throw new WriteError(404, "No such subagent run.");
  // Subagent transcripts mark every line as a sidechain; show them as a normal conversation.
  return c.json({ turns: toTurns(text.replace(/"isSidechain":true/g, '"isSidechain":false')) });
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

sessions.get("/overview", async (c) => {
  const [jobs, projects] = await Promise.all([listJobs(false), listProjects()]);
  const live = listLive();
  const needsYou = [
    ...live.filter((l) => l.pending.length).map((l) => ({ type: "live" as const, id: l.id, cwd: l.cwd, request: l.pending[0], at: l.pending[0].at })),
    ...jobs.filter((j) => j.state === "blocked").map((j) => ({ type: "job" as const, id: j.id, name: j.name, cwd: j.cwd, detail: j.detail, sessionId: j.sessionId, at: j.updatedAt })),
  ];
  const changes: { project: string; projectId: string; date: string; text: string }[] = [];
  for (const p of projects.filter((p) => p.group === "root" && p.docs.includes("CHANGELOG.md"))) {
    try {
      const { days } = parseChangelog(await readFile(join(untildify(p.id), "CHANGELOG.md"), "utf8"));
      for (const d of days.slice(0, 1)) for (const e of d.entries.slice(0, 2)) changes.push({ project: p.name, projectId: p.id, date: d.date, text: e });
    } catch {}
  }
  changes.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const counts: Record<string, number> = {};
  for (const j of jobs) counts[j.state] = (counts[j.state] ?? 0) + 1;
  return c.json({
    needsYou,
    jobs: jobs.slice(0, 6),
    jobCounts: counts,
    live: live.filter((l) => l.status !== "stopped").length,
    projects: projects.filter((p) => p.group === "root" && !p.empty).slice(0, 6),
    changes: changes.slice(0, 6),
    waiting: waitingCount(),
  });
});

// ---- Live sessions ----

sessions.get("/live", (c) => c.json(listLive()));

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
