import { Hono } from "hono";
import { getConnInfo } from "hono/bun";
import { readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { content } from "./api/content";
import type { Env } from "./api/env";
import { sessions } from "./api/sessions";
import { onRestart, system } from "./api/system";
import { guard, tlsFiles } from "./auth";
import { getConfig } from "./config";
import { indexSessions, replaceDocs, type Doc } from "./db/index";
import { emit } from "./events";
import { claudeDir, untildify } from "./fs/paths";
import { WriteError } from "./fs/safeWrite";
import { startWatching } from "./fs/watch";
import { stopAll } from "./live/sessions";
import { globalLibrary, projectLibrary } from "./scan/library";
import { listProjects } from "./scan/projects";

const app = new Hono<Env>();

app.use("*", guard((c) => getConnInfo(c).remote.address));
app.onError((err, c) => {
  if (err instanceof WriteError) return c.json({ error: err.message, current: err.current ?? null }, err.status);
  console.error(err);
  return c.json({ error: err.message || "Something went wrong." }, 500);
});

app.route("/api", system);
app.route("/api", content);
app.route("/api", sessions);
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

async function asset(pathname: string): Promise<Response | null> {
  const clean = pathname.replace(/\.\.+/g, "").replace(/\/+/g, "/");
  const embedded = globalThis.__CC_ASSETS;
  const file = embedded ? embedded[clean] : join(distDir, clean);
  if (!file) return null;
  const f = Bun.file(file);
  if (!(await f.exists())) return null;
  const headers: Record<string, string> = { "content-type": TYPES[extname(clean)] ?? "application/octet-stream" };
  if (clean.startsWith("/assets/")) headers["cache-control"] = "public, max-age=31536000, immutable";
  headers["content-security-policy"] = "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'";
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
  for (const p of projects.filter((p) => p.group === "root")) {
    const dir = untildify(p.id);
    items.push(...(await projectLibrary(dir)));
    for (const d of p.docs) docs.push({ kind: "doc", ref: join(dir, d), title: `${p.name} · ${d}`, subtitle: p.path, body: await read(join(dir, d)) });
  }
  for (const i of items) {
    if (i.kind === "plugin") continue;
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
    projects.filter((p) => p.group === "root").map((p) => untildify(p.id)),
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

async function serve() {
  const cfg = await getConfig();
  const port = Number(process.env.PORT ?? cfg.port);
  const tls = cfg.lan.enabled ? await tlsFiles() : undefined;
  server = Bun.serve({
    port,
    hostname: cfg.lan.enabled ? "0.0.0.0" : "127.0.0.1",
    tls,
    idleTimeout: 0, // server-sent events stay open
    fetch: (req, srv) => app.fetch(req, { server: srv }),
  });
  const url = `${tls ? "https" : "http"}://${cfg.lan.enabled ? "localhost" : "127.0.0.1"}:${port}`;
  console.log(`Control Center is running at ${url}${cfg.lan.enabled ? " (home network mode)" : ""}`);
  return url;
}

onRestart(async () => {
  server?.stop(true);
  await serve();
});

export async function main(opts: { open?: boolean } = {}) {
  console.log(`Reading ${claudeDir()}`);
  const url = await serve();
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
