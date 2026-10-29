import { Hono } from "hono";
import { getConnInfo } from "hono/bun";
import { readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { account } from "./api/account";
import { content } from "./api/content";
import { projectWork } from "./api/projectWork";
import type { Env } from "./api/env";
import { guides } from "./api/guides";
import { sessions } from "./api/sessions";
import { onRestart, system } from "./api/system";
import { guard, isLoopbackHost, tlsFiles } from "./auth";
import { getConfig } from "./config";
import { indexSessions, replaceDocs, type Doc } from "./db/index";
import { emit } from "./events";
import { claudeDir, untildify } from "./fs/paths";
import { errorResponse } from "./errors";
import { WriteError } from "./fs/safeWrite";
import { startWatching } from "./fs/watch";
import { stopAll } from "./live/sessions";
import { bump, metricFor } from "./metrics";
import { globalLibrary, projectLibrary } from "./scan/library";
import { listProjects } from "./scan/projects";

export const app = new Hono<Env>();

app.use("*", guard((c) => getConnInfo(c).remote.address));
app.use("/api/*", async (c, next) => {
  await next();
  if (c.res.status < 300) {
    const key = metricFor(c.req.method, new URL(c.req.url).pathname);
    if (key) void bump(key);
  }
});
app.onError((err, c) => {
  if (err instanceof WriteError && err.status === 409) void bump("edits.conflictsCaught");
  if (err instanceof WriteError) return c.json({ error: err.message, current: err.current ?? null }, err.status);
  console.error(err);
  const r = errorResponse(err);
  return c.json({ error: r.error }, r.status as 500);
});

app.route("/api", system);
app.route("/api", content);
app.route("/api", projectWork);
app.route("/api", sessions);
app.route("/api", guides);
app.route("/api", account);
app.all("/api/*", (c) => c.json({ error: "Not found." }, 404));

// ---- The web app: embedded in the compiled executable, or read from web/dist ----

declare global {
  // Set by the compile entry point: URL path -> embedded file path.
  var __CC_ASSETS: Record<string, string> | undefined;
}
const distDir = join(import.meta.dir, "..", "..", "web", "dist");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

// Pictures may come from the page itself and from mintcdn.com, the server the Claude Code docs shown in Guides use
// (John's yes on 2026-10-26, BACKLOG #115). Nothing else from outside.
export const PAGE_CSP = "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://mintcdn.com; connect-src 'self'";

async function asset(pathname: string): Promise<Response | null> {
  const clean = pathname.replace(/\.\.+/g, "").replace(/\/+/g, "/");
  const embedded = globalThis.__CC_ASSETS;
  const file = embedded ? embedded[clean] : join(distDir, clean);
  if (!file) return null;
  const f = Bun.file(file);
  if (!(await f.exists())) return null;
  const headers: Record<string, string> = { "content-type": TYPES[extname(clean)] ?? "application/octet-stream" };
  if (clean.startsWith("/assets/")) headers["cache-control"] = "public, max-age=31536000, immutable";
  headers["content-security-policy"] = PAGE_CSP;
  return new Response(f, { headers });
}

app.get("*", async (c) => {
  const p = new URL(c.req.url).pathname;
  return (await asset(p)) ?? (await asset("/index.html")) ?? c.text("The web app hasn't been built. Run `bun run build`.", 503);
});

// ---- Indexing ----

async function rebuildDocs() {
  const docs: Doc[] = [];
  const read = (p: string) => readFile(p, "utf8").catch(() => "");
  const { items } = await globalLibrary();
  const projects = (await listProjects()).filter((p) => !p.empty);
  for (const p of projects) {
    const dir = untildify(p.id);
    items.push(...(await projectLibrary(dir)));
    for (const d of p.docs) docs.push({ kind: "doc", ref: join(dir, d), title: `${p.name} · ${d}`, subtitle: p.path, body: await read(join(dir, d)) });
  }
  for (const i of items) {
    if (i.kind === "plugin") continue;
    if (i.kind === "hook-def") {
      docs.push({ kind: "hook", ref: i.path, title: `Hook: ${i.name}`, subtitle: i.display, body: i.description });
      continue;
    }
    docs.push({ kind: i.kind, ref: i.path, title: i.name, subtitle: i.description || i.display, body: i.access === "secret" ? "" : await read(i.path) });
  }
  replaceDocs(docs);
}

let docsTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleDocs = () => {
  if (docsTimer) clearTimeout(docsTimer);
  docsTimer = setTimeout(() => void rebuildDocs().catch(console.error), 1500);
};

async function boot() {
  const t = Date.now();
  const n = await indexSessions();
  const projects = await listProjects();
  await rebuildDocs();
  console.log(`Indexed ${n} changed transcripts and ${projects.length} projects in ${Date.now() - t} ms.`);
  startWatching(
    projects.map((p) => untildify(p.id)),
    async (areas) => {
      if (areas.has("sessions")) {
        await indexSessions().catch(console.error);
        emit({ area: "sessions" });
      }
      if (areas.has("library") || areas.has("projects") || areas.has("memory")) scheduleDocs();
    },
  );
}

// ---- Server ----

let server: ReturnType<typeof Bun.serve> | null = null;
let localServer: ReturnType<typeof Bun.serve> | null = null;

/**
 * The addresses the server answers at. `url` is the main one: https on localhost in home-network mode, else
 * http on 127.0.0.1. `localUrl` is what this computer's own window opens: a plain http listener on 127.0.0.1
 * and the next port, running in both modes so its address never changes when the mode is switched (and the
 * desktop web view would refuse the https address's self-made certificate anyway).
 */
export async function serverAddress() {
  const cfg = await getConfig();
  const port = Number(process.env.PORT ?? cfg.port);
  const lan = cfg.lan.enabled;
  const url = `${lan ? "https" : "http"}://${lan ? "localhost" : "127.0.0.1"}:${port}`;
  const localPort = port + 1;
  return { port, lan, url, localPort, localUrl: `http://127.0.0.1:${localPort}` };
}

/** Everything the server needs, loaded up front so starting it is synchronous. */
async function serveOptions() {
  const a = await serverAddress();
  const tls = a.lan ? await tlsFiles() : undefined;
  return { ...a, hostname: a.lan ? "0.0.0.0" : "127.0.0.1", tls };
}

const handle = (req: Request, srv: ReturnType<typeof Bun.serve>) => app.fetch(req, { server: srv });

/** The main listener for the current mode. */
function listen(o: Awaited<ReturnType<typeof serveOptions>>) {
  server = Bun.serve({
    port: o.port,
    hostname: o.hostname,
    tls: o.tls,
    idleTimeout: 0, // server-sent events stay open
    fetch: handle,
  });
  console.log(`Clape Code is running at ${o.url}${o.lan ? " (home network mode)" : ""}`);
  return o.url;
}

/**
 * This computer's local-only listener. Only this computer can reach 127.0.0.1, and its requests go through the
 * same guard as on the main listener. Requests must also name a loopback host, so a web page can't reach it by
 * pointing its own name at 127.0.0.1 (the https address is protected from that by its certificate).
 */
function listenLocal(o: Awaited<ReturnType<typeof serveOptions>>) {
  if (localServer) return;
  try {
    localServer = Bun.serve({
      port: o.localPort,
      hostname: "127.0.0.1",
      idleTimeout: 0,
      fetch: (req, srv) => (isLoopbackHost(req.headers.get("host") ?? "") ? handle(req, srv) : new Response("Forbidden host", { status: 403 })),
    });
    console.log(`This computer's window uses ${o.localUrl}`);
  } catch (e) {
    console.error(`ERROR: Couldn't open ${o.localUrl} for this computer's window (is port ${o.localPort} taken?): ${e instanceof Error ? e.message : e}`);
  }
}

/** Is the local-only listener running? */
export const localListening = () => localServer !== null;

/** Closes both listeners. */
export function stopServer() {
  server?.stop();
  localServer?.stop();
  server = localServer = null;
}

/** Starts the local-only listener and the main listener for the current mode. */
export async function startServer() {
  const o = await serveOptions();
  listenLocal(o);
  return listen(o);
}

// Called from the request that changes home-network mode. Async work queued after a Bun.serve handler has
// responded doesn't run while the server is idle, so the options are loaded here, inside the request, and the
// returned swap is synchronous. Only the main listener is swapped; the local-only one keeps running, so this
// computer's window keeps its address. The old main listener stops listening; the triggering request and any
// open live-update streams finish on their own (waiting for that would hang on the streams).
onRestart(async () => {
  const o = await serveOptions();
  return () => {
    try {
      server?.stop();
      server = null;
      listen(o);
    } catch (e) {
      console.error("Restart failed:", e);
    }
  };
});

export async function main(opts: { open?: boolean } = {}) {
  console.log(`Reading ${claudeDir()}`);
  const url = await startServer();
  await boot();
  if (opts.open) {
    const cmd = process.platform === "darwin" ? ["open", url] : process.platform === "win32" ? ["cmd", "/c", "start", "", url] : ["xdg-open", url];
    try {
      Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
    } catch {}
  }
  const shutdown = () => {
    stopAll();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (import.meta.main && basename(process.argv[1] ?? "") !== "compile-entry.ts") {
  void main({ open: process.argv.includes("--open") });
}
