// The real API, against a fixture home folder seeded with secrets: nothing secret may come back,
// and the login lockout can't be reset with a client-set header.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile, copyFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let root: string;
const SECRETS = ["secret@example.com", "user-secret-id", "machine-secret-id", "peer-secret-token", "rv-secret", "control-secret"];
let app: any;

const request = (path: string, init: RequestInit = {}, ip = "127.0.0.1") =>
  app.request(path, { ...init, headers: { host: "127.0.0.1:4317", ...(init.headers ?? {}) } }, { server: { requestIP: () => ({ address: ip, family: "IPv4", port: 1 }) } });

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cc-api-"));
  const claude = join(root, ".claude");
  process.env.CC_HOME = root;
  process.env.CC_CLAUDE_DIR = claude;
  process.env.CC_APP_DIR = join(root, "app");
  await mkdir(join(claude, "sessions"), { recursive: true });
  await mkdir(join(claude, "daemon"), { recursive: true });
  await mkdir(join(claude, "projects", "-demo"), { recursive: true });
  await mkdir(join(root, "projects", "demo"), { recursive: true });
  await writeFile(join(root, ".claude.json"), JSON.stringify({ oauthAccount: { emailAddress: "secret@example.com" }, userID: "user-secret-id", machineID: "machine-secret-id", projects: { [join(root, "projects", "demo")]: {} } }));
  await writeFile(join(claude, "sessions", "123.json"), JSON.stringify({ pid: 999999, sessionId: "s", cwd: root }));
  await writeFile(join(claude, "sessions", "123.abc.key"), JSON.stringify({ peerToken: "peer-secret-token" }));
  await writeFile(join(claude, "daemon", "roster.json"), JSON.stringify({ workers: {}, rvAuth: "rv-secret" }));
  await writeFile(join(claude, "daemon", "control.key"), "control-secret");
  await copyFile(join(import.meta.dir, "fixtures", "settings.json"), join(claude, "settings.json"));
  await copyFile(join(import.meta.dir, "fixtures", "transcript.jsonl"), join(claude, "projects", "-demo", "0f8d3c8e-0000-4000-8000-000000000000.jsonl"));
  await copyFile(join(import.meta.dir, "fixtures", "BACKLOG.md"), join(root, "projects", "demo", "BACKLOG.md"));

  ({ app } = await import("../src/index"));
  const { indexSessions } = await import("../src/db/index");
  const { listProjects } = await import("../src/scan/projects");
  await indexSessions();
  await listProjects();
});
afterAll(() => rm(root, { recursive: true, force: true }));

describe("secrets never leave the server", () => {
  const endpoints = ["/api/projects", "/api/sessions?empty=1", "/api/overview", "/api/library", "/api/settings", "/api/map", "/api/jobs", "/api/config", "/api/search?q=secret", "/api/memory/check", "/api/live"];
  for (const ep of endpoints) {
    test(ep, async () => {
      const res = await request(ep);
      expect(res.status).toBe(200);
      const body = await res.text();
      for (const s of SECRETS) expect(body).not.toContain(s);
    });
  }
  for (const f of ["~/.claude.json", "~/.claude/sessions/123.abc.key", "~/.claude/daemon/roster.json", "~/.claude/daemon/control.key"]) {
    test(`file endpoint refuses ${f}`, async () => {
      const res = await request(`/api/file?path=${encodeURIComponent(f)}`);
      expect(res.status).toBe(403);
      const body = await res.text();
      for (const s of SECRETS) expect(body).not.toContain(s);
    });
  }
});

describe("login rate limit", () => {
  test("allowLoginAttempt allows 5 per minute per address", async () => {
    const { allowLoginAttempt, resetLoginAttempts } = await import("../src/auth");
    resetLoginAttempts();
    expect([1, 2, 3, 4, 5, 6].map(() => allowLoginAttempt("10.0.0.1"))).toEqual([true, true, true, true, true, false]);
    expect(allowLoginAttempt("10.0.0.2")).toBe(true);
    resetLoginAttempts();
  });

  test("a faked X-Forwarded-For header doesn't reset the lockout", async () => {
    const { getConfig, saveConfig } = await import("../src/config");
    const cfg = await getConfig();
    await saveConfig({ ...cfg, lan: { enabled: true, passwordHash: await Bun.password.hash("correct-password") } });
    const login = (xff: string) =>
      request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": xff }, body: JSON.stringify({ password: "wrong" }) }, "10.0.0.9");
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await login(`192.168.1.${i}`)).status);
    expect(codes).toEqual([401, 401, 401, 401, 401, 429]);
    await saveConfig({ ...cfg, lan: { enabled: false, passwordHash: null } });
  });

  test("other devices need the login once home-network mode is on", async () => {
    const { getConfig, saveConfig } = await import("../src/config");
    const cfg = await getConfig();
    await saveConfig({ ...cfg, lan: { enabled: true, passwordHash: await Bun.password.hash("correct-password") } });
    expect((await request("/api/projects", {}, "10.0.0.20")).status).toBe(401);
    expect((await request("/api/projects", {}, "127.0.0.1")).status).toBe(200);
    await saveConfig({ ...cfg, lan: { enabled: false, passwordHash: null } });
  });
});

describe("listeners", () => {
  // A real connection from another device can't be made in a test; this computer's own network address is the
  // closest stand-in, since requests to it don't come from a loopback address.
  const lanIp = Object.values((require("node:os") as typeof import("node:os")).networkInterfaces())
    .flat()
    .find((i) => i && i.family === "IPv4" && !i.internal)?.address;

  test.skipIf(!lanIp)("this computer's window has a plain http listener on 127.0.0.1 in both modes that survives switching; other devices need the password over https", async () => {
    const { getConfig, saveConfig } = await import("../src/config");
    const { serverAddress, startServer, stopServer, localListening } = await import("../src/index");
    const cfg = await getConfig();
    const port = 40000 + Math.floor(Math.random() * 20000);
    const local = `http://127.0.0.1:${port + 1}`;
    process.env.PORT = String(port);
    await saveConfig({ ...cfg, lan: { enabled: false, passwordHash: await Bun.password.hash("correct-password") } });
    const insecure = { tls: { rejectUnauthorized: false } };
    const status = (url: string, init: RequestInit & { tls?: object } = {}) =>
      fetch(url, { signal: AbortSignal.timeout(2000), ...init }).then((r) => r.status, () => "refused");
    const lan = async (enabled: boolean) => {
      const r = await fetch(`${local}/api/lan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled }) });
      expect(r.status).toBe(200);
      await Bun.sleep(100); // the swap runs once the response is on its way
    };
    try {
      // Mode off: the main listener is http on 127.0.0.1, and the local listener is up too.
      expect(await serverAddress()).toMatchObject({ url: `http://127.0.0.1:${port}`, localUrl: local });
      await startServer();
      expect(localListening()).toBe(true);
      expect(await status(`http://127.0.0.1:${port}/api/projects`)).toBe(200);
      expect(await status(`${local}/api/projects`)).toBe(200);

      // Turned on from this computer's window: the local listener keeps answering at the same address.
      await lan(true);
      expect(await serverAddress()).toMatchObject({ url: `https://localhost:${port}`, localUrl: local });
      expect(await status(`${local}/api/projects`)).toBe(200);
      expect(await status(`${local}/api/projects`, { headers: { host: "evil.example:80" } })).toBe(403);
      // It isn't reachable on the network address.
      expect(await status(`http://${lanIp}:${port + 1}/api/projects`)).toBe("refused");

      // The https listener: from the network address the password is still needed, from this computer it isn't.
      expect(await status(`https://${lanIp}:${port}/api/projects`, insecure)).toBe(401);
      expect(await status(`https://127.0.0.1:${port}/api/projects`, insecure)).toBe(200);
      const login = await fetch(`https://${lanIp}:${port}/api/auth/login`, { ...insecure, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "correct-password" }) });
      expect(login.status).toBe(200);
      const cookie = login.headers.get("set-cookie")!.split(";")[0];
      expect(await status(`https://${lanIp}:${port}/api/projects`, { ...insecure, headers: { cookie } })).toBe(200);

      // Turned off again: the main listener is back to http on 127.0.0.1 and the local listener still answers.
      await lan(false);
      expect(await status(`http://127.0.0.1:${port}/api/projects`)).toBe(200);
      expect(await status(`https://${lanIp}:${port}/api/projects`, insecure)).toBe("refused");
      expect(await status(`${local}/api/projects`)).toBe(200);
      expect(localListening()).toBe(true);

      // Stopping the server closes both.
      stopServer();
      expect(await status(`${local}/api/projects`)).toBe("refused");
      expect(await status(`http://127.0.0.1:${port}/api/projects`)).toBe("refused");
    } finally {
      stopServer();
      delete process.env.PORT;
      const { resetLoginAttempts } = await import("../src/auth");
      resetLoginAttempts();
      await saveConfig({ ...cfg, lan: { enabled: false, passwordHash: null } });
    }
  });
});

describe("errors", () => {
  test("permission errors are reworded", async () => {
    if (process.platform === "win32") return;
    const { chmod } = await import("node:fs/promises");
    const f = join(root, "projects", "demo", "locked.md");
    await writeFile(f, "x");
    await chmod(f, 0o000);
    const res = await request(`/api/file?path=${encodeURIComponent(f)}`);
    await chmod(f, 0o644);
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe("The app doesn't have permission to open this file.");
    expect(JSON.stringify(body)).not.toContain("EACCES");
  });
  test("missing-file errors are reworded", async () => {
    const res = await request(`/api/file?path=${encodeURIComponent(join(root, "projects", "demo", "gone.md"))}`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("This file no longer exists. It may have been moved or deleted.");
    const { errorResponse } = await import("../src/errors");
    const raw = Object.assign(new Error("ENOENT: no such file or directory, open '/x'"), { code: "ENOENT" });
    expect(errorResponse(raw)).toEqual({ status: 404, error: "This file no longer exists. It may have been moved or deleted." });
  });
  test("unknown errors hide internals", async () => {
    const { errorResponse } = await import("../src/errors");
    const r = errorResponse(new Error("Cannot read properties of undefined (reading 'x') at /Users/john/secret.ts"));
    expect(r).toEqual({ status: 500, error: "Something went wrong on the server. Try again." });
  });
});

describe("project board, context files and new projects", () => {
  const demo = encodeURIComponent("~/projects/demo");
  const post = (path: string, body: unknown) => request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const detail = async () => (await (await request(`/api/projects/${demo}`)).json()) as any;

  test("Start a board, then add, move across all columns and delete a card", async () => {
    expect((await detail()).board).toBeNull();
    expect((await post(`/api/projects/${demo}/board/start`, {})).status).toBe(200);
    expect((await post(`/api/projects/${demo}/board/start`, {})).status).toBe(409);
    const file = join(root, "projects", "demo", "PROGRESS.md");
    const start = await Bun.file(file).text();
    let d = await detail();
    expect(d.board.columns.map((c: any) => c.name)).toEqual(["Next", "In progress", "Done"]);
    let r = await post(`/api/projects/${demo}/board/add`, { column: "next", text: "Try it #test", hash: d.board.hash });
    expect(r.status).toBe(200);
    for (const to of ["progress", "done", "next"]) {
      d = await detail();
      const card = d.board.columns.flatMap((c: any) => c.cards).find((c: any) => c.title === "Try it");
      expect(card.labels).toEqual(["test"]);
      r = await post(`/api/projects/${demo}/board/move`, { line: card.line, to, hash: d.board.hash });
      expect(r.status).toBe(200);
    }
    expect((await post(`/api/projects/${demo}/board/move`, { line: 0, to: "done", hash: "stale" })).status).toBe(409);
    d = await detail();
    const card = d.board.columns[0].cards[0];
    await post(`/api/projects/${demo}/board/delete`, { line: card.line, hash: d.board.hash });
    expect(await Bun.file(file).text()).toBe(start);
  });

  test("Add context takes text files, refuses binary and big ones, and the switch edits CLAUDE.md", async () => {
    const send = (name: string, data: string | Uint8Array) => {
      const fd = new FormData();
      fd.append("file", new File([data], name));
      return request(`/api/projects/${demo}/context`, { method: "POST", body: fd });
    };
    const ok = await send("API notes.md", "# Notes\n");
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as any).name).toBe("API-notes.md");
    expect((await send("API notes.md", "again")).status).toBe(409);
    expect((await send("pic.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0xff]))).status).toBe(400);
    expect((await send("big.txt", "a".repeat(2 * 1024 * 1024 + 1))).status).toBe(400);
    let d = await detail();
    expect(d.context.files).toEqual([expect.objectContaining({ name: "API-notes.md", imported: false })]);
    expect(d.context.claudeMd.hash).toBeNull();
    expect((await post(`/api/projects/${demo}/context/import`, { name: "API-notes.md", on: true, hash: null })).status).toBe(200);
    const md = join(root, "projects", "demo", "CLAUDE.md");
    expect(await Bun.file(md).text()).toBe("@docs/API-notes.md\n");
    d = await detail();
    expect(d.context.files[0].imported).toBe(true);
    await post(`/api/projects/${demo}/context/import`, { name: "API-notes.md", on: false, hash: d.context.claudeMd.hash });
    expect(await Bun.file(md).text()).toBe("");
  });

  test("New project makes the folder, CLAUDE.md and an empty board, and shows up at once", async () => {
    const r = await post("/api/projects-new", { name: "fresh-one" });
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.id).toBe("~/projects/fresh-one");
    const dir = join(root, "projects", "fresh-one");
    expect(await Bun.file(join(dir, "PROGRESS.md")).text()).toBe("# Progress\n\n## Next\n\n## In progress\n\n## Done\n");
    expect(await Bun.file(join(dir, "CLAUDE.md")).text()).toContain("# fresh-one");
    const list = (await (await request("/api/projects")).json()) as any[];
    expect(list.some((p) => p.id === "~/projects/fresh-one")).toBe(true);
    expect((await post("/api/projects-new", { name: "fresh-one" })).status).toBe(409);
    expect((await post("/api/projects-new", { name: "x", folder: join(root, "elsewhere", "x") })).status).toBe(400);
    expect((await post("/api/projects-new", { name: "../up" })).status).toBe(400);
  });
});

describe("Settings page writes", () => {
  const demo = "~/projects/demo";
  const post = (path: string, body: unknown) => request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const change = (change: unknown, scope = "global", local = false) => post("/api/settings/change", { scope, local, change });
  const user = () => join(root, ".claude", "settings.json");
  const local = () => join(root, "projects", "demo", ".claude", "settings.local.json");
  const keys = () => join(root, ".claude", "keybindings.json");
  const json = async (f: string) => JSON.parse(await readFile(f, "utf8"));

  test("add and remove a permission rule", async () => {
    expect((await post("/api/settings/add", { scope: "global", what: "permission", list: "deny", rule: "Read(./.env)" })).status).toBe(200);
    expect((await json(user())).permissions.deny).toEqual(["Read(./.env)"]);
    expect((await change({ op: "permission-remove", list: "deny", rule: "Read(./.env)" })).status).toBe(200);
    expect((await json(user())).permissions).toEqual({ allow: ["Bash(osascript *)"] });
    expect((await change({ op: "permission-remove", list: "deny", rule: "Read(./.env)" })).status).toBe(404);
    expect((await change({ op: "permission-remove", list: "maybe", rule: "x" })).status).toBe(400);
  });

  test("set and clear the model in a project's local file", async () => {
    expect((await change({ op: "model", value: "sonnet[1m]" }, demo, true)).status).toBe(200);
    expect((await json(local())).model).toBe("sonnet[1m]");
    expect((await change({ op: "model", value: null }, demo, true)).status).toBe(200);
    expect(await json(local())).toEqual({});
    expect((await change({ op: "model", value: "rm -rf /" }, demo, true)).status).toBe(400);
  });

  test("environment variable values stay on the server until asked for", async () => {
    expect((await change({ op: "env-set", name: "MY_TOKEN", value: "env-secret-value" })).status).toBe(200);
    expect((await json(user())).env).toEqual({ MY_TOKEN: "env-secret-value" });
    const view = await (await request("/api/settings")).text();
    expect(view).toContain("MY_TOKEN");
    expect(view).not.toContain("env-secret-value");
    const shown = (await (await request("/api/settings/env-value?source=user&name=MY_TOKEN")).json()) as { value: string };
    expect(shown.value).toBe("env-secret-value");
    expect((await request("/api/settings/env-value?source=local&name=MY_TOKEN")).status).toBe(400);
    expect((await change({ op: "env-set", name: "1BAD", value: "x" })).status).toBe(400);
    expect((await change({ op: "env-remove", name: "MY_TOKEN" })).status).toBe(200);
    expect((await json(user())).env).toBeUndefined();
  });

  test("set and remove the status line", async () => {
    expect((await change({ op: "statusline", command: "~/.claude/statusline.sh", padding: 2, refreshInterval: 5, hideVimModeIndicator: false })).status).toBe(200);
    expect((await json(user())).statusLine).toEqual({ type: "command", command: "~/.claude/statusline.sh", padding: 2, refreshInterval: 5 });
    expect((await change({ op: "statusline", command: "x", refreshInterval: 0 })).status).toBe(400);
    expect((await change({ op: "statusline", command: null })).status).toBe(200);
    expect((await json(user())).statusLine).toBeUndefined();
  });

  test("sandbox switches and lists, leaving no empty objects behind", async () => {
    expect((await change({ op: "sandbox-flag", field: "enabled", value: true })).status).toBe(200);
    expect((await change({ op: "sandbox-list", field: "network.allowedDomains", add: "github.com" })).status).toBe(200);
    expect((await change({ op: "sandbox-list", field: "network.allowedDomains", add: "github.com" })).status).toBe(200);
    expect((await json(user())).sandbox).toEqual({ enabled: true, network: { allowedDomains: ["github.com"] } });
    expect((await change({ op: "sandbox-list", field: "network.allowedDomains", remove: "github.com" })).status).toBe(200);
    expect((await change({ op: "sandbox-flag", field: "enabled", value: null })).status).toBe(200);
    expect((await json(user())).sandbox).toBeUndefined();
    expect((await change({ op: "sandbox-flag", field: "bwrapPath", value: true })).status).toBe(400);
    expect((await change({ op: "sandbox-list", field: "filesystem.denyRead", remove: "~/.aws" })).status).toBe(404);
  });

  test("theme takes only documented values", async () => {
    expect((await change({ op: "theme", value: "light-daltonized" })).status).toBe(200);
    expect((await json(user())).theme).toBe("light-daltonized");
    expect((await change({ op: "theme", value: "custom:missing" })).status).toBe(400);
    expect((await change({ op: "theme", value: "auto" })).status).toBe(200);
  });

  test("the rest of settings.json is untouched", async () => {
    const before = JSON.parse(await readFile(join(import.meta.dir, "fixtures", "settings.json"), "utf8"));
    expect(await json(user())).toEqual(before);
  });

  test("change, unbind and remove a keyboard shortcut", async () => {
    expect((await post("/api/keybindings/set", { context: "Chat", keys: "Ctrl+E", action: "chat:externalEditor" })).status).toBe(200);
    expect((await post("/api/keybindings/set", { context: "Chat", keys: "ctrl+s", action: null })).status).toBe(200);
    const k = await json(keys());
    expect(k.$docs).toBe("https://code.claude.com/docs/en/keybindings");
    expect(k.bindings).toEqual([{ context: "Chat", bindings: { "ctrl+e": "chat:externalEditor", "ctrl+s": null } }]);
    const view = (await (await request("/api/settings")).json()) as any;
    expect(view.keybindings.blocks[0].bindings).toContainEqual({ key: "ctrl+s", action: null });
    expect((await post("/api/keybindings/set", { context: "Chat", keys: "ctrl+c", action: "chat:submit" })).status).toBe(400);
    expect((await post("/api/keybindings/set", { context: "Chat", keys: "ctl+k", action: "chat:submit" })).status).toBe(400);
    expect((await post("/api/keybindings/set", { context: "Nowhere", keys: "ctrl+k", action: "chat:submit" })).status).toBe(400);
    expect((await post("/api/keybindings/set", { context: "Chat", keys: "ctrl+k", action: "chat:madeUp" })).status).toBe(400);
    await post("/api/keybindings/remove", { context: "Chat", keys: "ctrl+e" });
    await post("/api/keybindings/remove", { context: "Chat", keys: "ctrl+s" });
    expect((await json(keys())).bindings).toEqual([]);
  });

  test("a settings file that isn't valid JSON is refused, not overwritten", async () => {
    await writeFile(local(), "{ broken");
    const r = await change({ op: "model", value: "opus" }, demo, true);
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toContain("Fix it as text first");
    expect(await readFile(local(), "utf8")).toBe("{ broken");
  });
});
