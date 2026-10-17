import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { allowLoginAttempt, COOKIE, issueToken, verifyToken } from "../auth";
import { getConfig, publicConfig, saveConfig } from "../config";
import { subscribe, type AppEvent } from "../events";
import { canRead } from "../fs/policy";
import { untildify } from "../fs/paths";
import { WriteError } from "../fs/safeWrite";
import { waitingCount } from "../live/sessions";
import { addFeedback, bump, getMetrics, readFeedback } from "../metrics";
import type { Env } from "./env";

export const system = new Hono<Env>();

export type Restart = () => Promise<void>;
let restart: Restart = async () => {};
export const onRestart = (r: Restart) => (restart = r);

system.get("/auth/status", async (c) => {
  const cfg = await getConfig();
  const { getCookie } = await import("hono/cookie");
  return c.json({ lanEnabled: cfg.lan.enabled, isLocal: c.get("isLocal"), loggedIn: c.get("isLocal") || (await verifyToken(getCookie(c, COOKIE))) });
});

system.post("/auth/login", async (c) => {
  const cfg = await getConfig();
  const ip = c.get("isLocal") ? "local" : (c.req.header("x-forwarded-for") ?? "remote");
  if (!allowLoginAttempt(ip)) return c.json({ error: "Too many attempts. Wait a minute and try again." }, 429);
  const { password } = await c.req.json();
  if (!cfg.lan.passwordHash || !(await Bun.password.verify(String(password ?? ""), cfg.lan.passwordHash))) {
    return c.json({ error: "Wrong password." }, 401);
  }
  setCookie(c, COOKIE, await issueToken(), { httpOnly: true, secure: true, sameSite: "Strict", path: "/", maxAge: 7 * 24 * 3600 });
  return c.json({ ok: true });
});

system.post("/auth/logout", (c) => {
  deleteCookie(c, COOKIE, { path: "/" });
  return c.json({ ok: true });
});

system.get("/config", async (c) => c.json({ ...publicConfig(await getConfig()), platform: process.platform }));

system.post("/config", async (c) => {
  const { projectRoots } = await c.req.json();
  if (!Array.isArray(projectRoots) || !projectRoots.every((r) => typeof r === "string" && r.trim())) throw new WriteError(400, "Project folders must be a list of paths.");
  const cfg = await getConfig();
  await saveConfig({ ...cfg, projectRoots: projectRoots.map((r: string) => r.trim()) });
  return c.json(publicConfig(await getConfig()));
});

/** Turning home-network mode on or off is only allowed from this machine. */
system.post("/lan", async (c) => {
  if (!c.get("isLocal")) throw new WriteError(403, "Change this from the computer the app runs on.");
  const { enabled, password } = await c.req.json();
  const cfg = await getConfig();
  let passwordHash = cfg.lan.passwordHash;
  if (password) {
    if (String(password).length < 10) throw new WriteError(400, "Use a password of at least 10 characters.");
    passwordHash = await Bun.password.hash(String(password));
  }
  if (enabled && !passwordHash) throw new WriteError(400, "Set a password first.");
  await saveConfig({ ...cfg, lan: { enabled: !!enabled, passwordHash } });
  setTimeout(() => void restart(), 200);
  return c.json(publicConfig(await getConfig()));
});

system.post("/metrics/view", async (c) => {
  const { view } = await c.req.json();
  if (typeof view === "string" && /^[a-z]{1,20}$/.test(view)) await bump(`view.${view}`);
  return c.json({ ok: true });
});
system.get("/metrics", async (c) => c.json({ counts: await getMetrics(), feedback: await readFeedback() }));
system.post("/feedback", async (c) => {
  const { text } = await c.req.json();
  if (!String(text ?? "").trim()) throw new WriteError(400, "Write something first.");
  await addFeedback(String(text).slice(0, 2000));
  return c.json({ ok: true });
});

/** Open a file or folder in the editor or file manager on the computer running the app. */
system.post("/open", async (c) => {
  if (!c.get("isLocal")) throw new WriteError(403, "Files open on the computer running the app, so this only works there.");
  const { path, editor } = await c.req.json();
  const abs = untildify(String(path ?? ""));
  if (!canRead(abs)) throw new WriteError(403, "The app can't open files here.");
  const code = editor ? Bun.which("code") : null;
  const cmd = code ? [code, abs] : process.platform === "darwin" ? ["open", abs] : process.platform === "win32" ? ["explorer", abs] : ["xdg-open", abs];
  Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
  return c.json({ ok: true, with: code ? "VS Code" : "default app" });
});

system.get("/events", (c) =>
  streamSSE(c, async (stream) => {
    const queue: AppEvent[] = [];
    let wake: (() => void) | null = null;
    const off = subscribe((e) => {
      queue.push(e);
      wake?.();
    });
    stream.onAbort(() => {
      off();
      wake?.();
    });
    await stream.writeSSE({ event: "hello", data: JSON.stringify({ waiting: waitingCount() }) });
    while (!stream.aborted) {
      if (!queue.length) {
        await Promise.race([new Promise<void>((r) => (wake = r)), stream.sleep(25_000)]);
        wake = null;
      }
      if (stream.aborted) break;
      if (!queue.length) {
        await stream.writeSSE({ event: "ping", data: "" });
        continue;
      }
      const batch = queue.splice(0);
      await stream.writeSSE({ event: "change", data: JSON.stringify({ areas: [...new Set(batch.map((e) => e.area))], waiting: waitingCount() }) });
    }
    off();
  }),
);
