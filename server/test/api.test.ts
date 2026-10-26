// The real API, against a fixture home folder seeded with secrets: nothing secret may come back,
// and the login lockout can't be reset with a client-set header.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile, copyFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installFakeClaude } from "./fakeClaude";

let root: string;
// The last two come from the fake `claude auth status` (fixtures/fake-claude.ts).
const SECRETS = ["token-source-secret", "org-secret-id", "sk-ant-oat01-secret-token", "secret@example.com", "user-secret-id", "machine-secret-id", "peer-secret-token", "rv-secret", "control-secret"];
let app: any;

const request = (path: string, init: RequestInit = {}, ip = "127.0.0.1") =>
  app.request(path, { ...init, headers: { host: "127.0.0.1:4317", ...(init.headers ?? {}) } }, { server: { requestIP: () => ({ address: ip, family: "IPv4", port: 1 }) } });

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cc-api-"));
  const claude = join(root, ".claude");
  process.env.CC_HOME = root;
  process.env.CC_CLAUDE_DIR = claude;
  process.env.CC_APP_DIR = join(root, "app");
  await installFakeClaude(root);
  process.env.FAKE_CLAUDE_LOG = join(root, "claude-calls.log");
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

  // Two background sessions stopped by a usage limit: one on 12 Oct, long past, and one just now.
  const job = async (id: string, updatedAt: string) => {
    await mkdir(join(claude, "jobs", id), { recursive: true });
    await writeFile(join(claude, "jobs", id, "state.json"), JSON.stringify({ name: id, state: "blocked", detail: "You've hit your session limit · resets 1:30pm", updatedAt }));
  };
  await job("old-limit", "2026-10-12T10:00:00Z");
  await job("new-limit", new Date().toISOString());

  // Typed prompts, epoch ms like Claude Code writes them. One habit in two spellings, 11 times in all.
  const typed = [
    ...Array(7).fill("read your instructions"),
    ...Array(4).fill("Read your instructions  "),
    ...Array(6).fill("exit"),
    ...Array(5).fill("/clear"),
    ...Array(4).fill("wrap up"),
    ...Array(3).fill("ship it now"),
    ...Array(2).fill("run the tests"),
    ...["a", "b", "c", "d", "e"].flatMap((x) => Array(3).fill(`prompt ${x}`)),
  ];
  await writeFile(join(claude, "history.jsonl"), typed.map((display, i) => JSON.stringify({ display, pastedContents: {}, timestamp: 1782178288164 + i, project: join(root, "projects", "demo"), sessionId: "e2644826-95f0-4880-8af9-8169d229cf1d" })).join("\n") + "\n");

  // A session started from the app saved its account; the stray field must never reach the browser.
  await mkdir(join(root, "app"), { recursive: true });
  await writeFile(join(root, "app", "session-accounts.json"), JSON.stringify({ "e2644826-95f0-4880-8af9-8169d229cf1d": { provider: "firstParty", providerName: "Anthropic", email: "me@example.com", organization: "Acme", plan: "Claude Pro", tokenSource: "token-source-secret" } }));
  ({ app } = await import("../src/index"));
  const { indexSessions } = await import("../src/db/index");
  const { listProjects } = await import("../src/scan/projects");
  await indexSessions();
  await listProjects();
});
afterAll(() => rm(root, { recursive: true, force: true }));

describe("secrets never leave the server", () => {
  const endpoints = ["/api/projects", "/api/sessions?empty=1", "/api/overview", "/api/library", "/api/settings", "/api/map", "/api/jobs", "/api/config", "/api/search?q=secret", "/api/memory/check", "/api/live", "/api/account", "/api/account?project=" + encodeURIComponent("~/projects/demo"), "/api/account/login", "/api/sessions/e2644826-95f0-4880-8af9-8169d229cf1d", "/api/suggested"];
  for (const ep of endpoints) {
    test(ep, async () => {
      const res = await request(ep);
      expect(res.status).toBe(200);
      const body = await res.text();
      for (const s of SECRETS) expect(body).not.toContain(s);
      // The fake status also prints its config and projects folders, which only the picked fields may hide.
      if (ep.startsWith("/api/account")) for (const s of ["configDirectory", "projectsDirectory", join(root, ".claude")]) expect(body).not.toContain(s);
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

describe("account", () => {
  test("account endpoint sends only picked fields", async () => {
    const res = await request("/api/account");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["email", "installed", "loggedIn", "method", "methodName", "organization", "plan", "problem", "provider", "providerName"]);
    expect(body).toMatchObject({ loggedIn: true, methodName: "Claude account", email: "me@example.com", organization: "Acme", plan: "Claude Pro" });
    const text = JSON.stringify(body);
    for (const s of ["configDirectory", "projectsDirectory", "orgId", root]) expect(text).not.toContain(s);
  });

  test("project account runs in the project folder", async () => {
    const res = await request("/api/account?project=" + encodeURIComponent("~/projects/demo"));
    expect(res.status).toBe(200);
    const calls = (await readFile(join(root, "claude-calls.log"), "utf8")).trim().split("\n");
    expect(calls.at(-1)!.split("|")[1]).toEndWith(join("projects", "demo"));
    expect((await request("/api/account?project=nope")).status).toBe(404);
  });
});

describe("session accounts", () => {
  test("session endpoints include the saved account", async () => {
    const list = await (await request("/api/sessions?empty=1")).json();
    const s = list.find((x: any) => x.sessionId === "e2644826-95f0-4880-8af9-8169d229cf1d");
    expect(s.account).toEqual({ provider: "firstParty", providerName: "Anthropic", email: "me@example.com", organization: "Acme", plan: "Claude Pro" });
    const one = await (await request("/api/sessions/e2644826-95f0-4880-8af9-8169d229cf1d")).json();
    expect(one.account.email).toBe("me@example.com");
    const live = await (await request("/api/live")).json();
    expect(Array.isArray(live)).toBe(true);
    // Without a saved account (a session started elsewhere) the field is null.
    const file = join(root, "app", "session-accounts.json");
    const kept = await readFile(file, "utf8");
    await writeFile(file, "{}");
    try {
      const bare = (await (await request("/api/sessions?empty=1")).json()).find((x: any) => x.sessionId === "e2644826-95f0-4880-8af9-8169d229cf1d");
      expect(bare.account).toBeNull();
      expect((await (await request("/api/sessions/e2644826-95f0-4880-8af9-8169d229cf1d")).json()).account).toBeNull();
    } finally {
      await writeFile(file, kept);
    }
  });
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

describe("overview", () => {
  test("a usage limit from days ago is an ordinary session, not one that needs you or is paused", async () => {
    const o = await (await request("/api/overview")).json();
    expect(o.paused).toBeUndefined();
    expect(o.needsYou.map((n: any) => n.id)).toEqual(["new-limit"]);
  });
});

describe("suggested", () => {
  const suggested = async () => (await (await request("/api/suggested")).json()) as { prompt: string; name: string; count: number }[];

  test("counts prompts ignoring capitals and trailing spaces, skips commands and one-word prompts, most typed first, at most 5", async () => {
    const list = await suggested();
    expect(list[0]).toEqual({ prompt: "read your instructions", name: "read-your-instructions", count: 11 });
    expect(list[1]).toEqual({ prompt: "wrap up", name: "wrap-up", count: 4 });
    expect(list).toHaveLength(5);
    const prompts = list.map((s) => s.prompt);
    for (const p of ["exit", "/clear", "run the tests"]) expect(prompts).not.toContain(p);
  });

  test("sends only the prompt, its skill name and its count", async () => {
    const res = await request("/api/suggested");
    const text = await res.text();
    for (const s of [root, "e2644826", "demo", "timestamp"]) expect(text).not.toContain(s);
    for (const s of JSON.parse(text)) expect(Object.keys(s).sort()).toEqual(["count", "name", "prompt"]);
  });

  test("the skill name is always one the New skill form accepts", async () => {
    const { skillNameOf } = await import("../src/scan/suggested");
    expect(skillNameOf("Fix the bug!  Then commit.")).toBe("fix-the-bug-then-commit");
    const long = skillNameOf("please read every instruction file in this project and then summarise what changed since yesterday");
    expect(long.length).toBeLessThanOrEqual(64);
    expect(long).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  test("a prompt is dropped once a skill of its name exists, globally or in a project", async () => {
    const make = (name: string, scope: string) =>
      request("/api/library/new", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "skill", scope, name, description: "Test skill", body: name }) });
    expect((await make("read-your-instructions", "global")).status).toBe(200);
    expect((await suggested()).map((s) => s.prompt)).not.toContain("read your instructions");
    expect((await make("wrap-up", "~/projects/demo")).status).toBe(200);
    const prompts = (await suggested()).map((s) => s.prompt);
    expect(prompts).not.toContain("wrap up");
    expect(prompts[0]).toBe("ship it now");
  });
});

describe("a conversation is addressed by its session ID", () => {
  // Stands in for the Agent SDK's query(): answers each message in turn, asks for approval on "make a file", asks a
  // question on "ask me", and holds a "slow" message until `release` is called.
  const OLD = "e2644826-95f0-4880-8af9-8169d229cf1d";
  const TERMINAL = "7a1b2c3d-0000-4000-8000-000000000001";
  const queries: { options: any; received: string[]; mode: string; model?: string; interrupts: number }[] = [];
  let release: () => void = () => {};
  const post = (path: string, body: unknown = {}) => request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const get = async (path: string) => (await request(path)).json();
  const until = async (fn: () => Promise<boolean> | boolean) => {
    for (let i = 0; i < 200; i++) {
      if (await fn()) return;
      await Bun.sleep(10);
    }
    throw new Error("timed out");
  };

  function fakeQuery({ prompt, options }: any) {
    const sid = options.sessionId ?? options.resume;
    const rec: (typeof queries)[number] = { options, received: [], mode: options.permissionMode, interrupts: 0 };
    queries.push(rec);
    const say = (text: string) => ({ type: "assistant", session_id: sid, message: { content: [{ type: "text", text }] } });
    async function* run() {
      yield { type: "system", subtype: "init", session_id: sid, model: options.model ?? "fake-model" };
      for await (const m of prompt as AsyncIterable<any>) {
        const text = m.message.content as string;
        rec.received.push(text);
        if (text.includes("slow")) await new Promise<void>((r) => (release = r));
        if (text.includes("make a file")) {
          const r = await options.canUseTool("Write", { file_path: "a.txt", content: "hi" }, { requestId: "req-write", signal: new AbortController().signal, suggestions: [] });
          yield say(`write ${r.behavior}`);
        }
        if (text.includes("ask me")) {
          const r = await options.canUseTool("AskUserQuestion", { questions: [{ question: "Which name?", options: [{ label: "a" }, { label: "b" }] }] }, { requestId: "req-ask", signal: new AbortController().signal });
          yield say(`answered ${JSON.stringify(r.updatedInput?.answers)}`);
        }
        yield say(`reply to ${text}`);
        yield { type: "result", subtype: "success", session_id: sid, total_cost_usd: 0, is_error: false };
      }
    }
    return Object.assign(run(), {
      interrupt: async () => void rec.interrupts++,
      setPermissionMode: async (mode: string) => void (rec.mode = mode),
      setModel: async (model?: string) => void (rec.model = model),
      supportedCommands: async () => [],
      accountInfo: async () => Promise.reject(new Error("no account in tests")),
    });
  }

  beforeAll(async () => {
    const { setQueryForTests } = await import("../src/live/sessions");
    setQueryForTests(fakeQuery as any);
    // A session typed in the terminal, which is never from a script.
    await writeFile(
      join(root, ".claude", "projects", "-demo", `${TERMINAL}.jsonl`),
      JSON.stringify({ type: "user", entrypoint: "cli", sessionId: TERMINAL, cwd: join(root, "projects", "demo"), timestamp: "2026-10-20T10:00:00Z", message: { role: "user", content: "hello from the terminal" } }) + "\n",
    );
    const { indexSessions } = await import("../src/db/index");
    await indexSessions();
  });
  afterAll(async () => {
    const { setQueryForTests, stopAll } = await import("../src/live/sessions");
    stopAll();
    setQueryForTests(null);
  });

  test("list entries say whether a script ran them and whether they're archived", async () => {
    const list = await get("/api/sessions?empty=1");
    const of = (id: string) => list.find((s: any) => s.sessionId === id);
    // The fixture's entrypoint is "sdk-cli" and Control Center has no record of starting it: a `claude -p` run.
    expect(of(OLD)).toMatchObject({ fromScript: true, archived: false });
    expect(of(TERMINAL)).toMatchObject({ fromScript: false, archived: false });
    await post("/api/sessions/archive", { ids: [TERMINAL], archived: true });
    expect((await get("/api/sessions?empty=1&archived=1")).find((s: any) => s.sessionId === TERMINAL)).toMatchObject({ archived: true });
    expect((await get("/api/sessions?empty=1")).some((s: any) => s.sessionId === TERMINAL)).toBe(false);
    // "Show archived" lists archived sessions beside the others.
    const both = await get("/api/sessions?empty=1&archived=all");
    expect(both.find((s: any) => s.sessionId === TERMINAL)).toMatchObject({ archived: true });
    expect(both.find((s: any) => s.sessionId === OLD)).toMatchObject({ archived: false });
    await post("/api/sessions/archive", { ids: [TERMINAL], archived: false });
  });

  test("list entries carry a state only while Claude is working or waiting", async () => {
    expect((await get("/api/sessions?empty=1")).find((s: any) => s.sessionId === TERMINAL)).toMatchObject({ activity: null });
    const { sessionActivity } = await import("../src/api/sessions");
    const a = sessionActivity(
      [
        { sessionId: "term-busy", status: "busy" },
        { sessionId: "term-idle", status: "idle" },
        { sessionId: "here", status: "busy" },
      ],
      // Newest first, as listLive returns them: the newest live session for a conversation wins.
      [
        { sessionId: "here", status: "idle", pending: [] },
        { sessionId: "asks", status: "working", pending: [{}] },
        { sessionId: "works", status: "working", pending: [] },
        { sessionId: "starts", status: "starting", pending: [] },
        { sessionId: "ended", status: "stopped", pending: [] },
        { sessionId: "ended", status: "working", pending: [] },
      ],
    );
    expect(Object.fromEntries(a)).toEqual({ "term-busy": "working", asks: "waiting", works: "working", starts: "working" });
  });

  test("a finished conversation has its transcript and no live state", async () => {
    const one = await get(`/api/sessions/${OLD}`);
    expect(one.totalTurns).toBeGreaterThan(0);
    expect(one).toMatchObject({ status: "done", liveId: null, pending: [], permissionMode: null });
    expect(one.events).toBeUndefined();
    expect((await request("/api/sessions/not-a-session")).status).toBe(400);
    expect((await request("/api/sessions/00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });

  test("New starts a session, returns its session ID at once and records it as started by Control Center", async () => {
    expect((await post("/api/sessions/new", { project: "~/projects/demo", prompt: " " })).status).toBe(400);
    expect((await post("/api/sessions/new", { project: "~/nowhere", prompt: "hi" })).status).toBe(400);
    const res = await post("/api/sessions/new", { project: "~/projects/demo", prompt: "hello", model: "sonnet", permissionMode: "acceptEdits" });
    expect(res.status).toBe(200);
    const { sessionId } = await res.json();
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(queries.at(-1)!.options).toMatchObject({ sessionId, model: "sonnet", permissionMode: "acceptEdits" });
    expect(queries.at(-1)!.options.resume).toBeUndefined();
    // No transcript yet: the page still opens, with the live state.
    await until(async () => (await get(`/api/sessions/${sessionId}`)).status === "idle");
    const one = await get(`/api/sessions/${sessionId}`);
    expect(one).toMatchObject({ sessionId, totalTurns: 1, fromScript: false, permissionMode: "acceptEdits", model: "sonnet" });
    const { startedSessions } = await import("../src/live/started");
    await until(async () => !!(await startedSessions())[sessionId]);
    expect(JSON.parse(await readFile(join(root, "app", "started-sessions.json"), "utf8"))[sessionId]).toBeString();
  });

  test("A3: a message sent while Claude works goes to the same session without stopping it; Stop stops it", async () => {
    const { sessionId } = await (await post("/api/sessions/new", { project: "~/projects/demo", prompt: "slow one" })).json();
    const q = queries.at(-1)!;
    await until(() => q.received.length === 1);
    expect((await get(`/api/sessions/${sessionId}`)).status).toBe("working");
    const sent = await (await post(`/api/sessions/${sessionId}/send`, { text: "and another" })).json();
    expect(sent).toMatchObject({ sessionId, resumed: false });
    expect(queries.at(-1)).toBe(q);
    expect(q.interrupts).toBe(0);
    release();
    await until(() => q.received.length === 2);
    expect(q.received).toEqual(["slow one", "and another"]);
    expect((await post(`/api/sessions/${sessionId}/interrupt`)).status).toBe(200);
    expect(q.interrupts).toBe(1);
    expect((await post(`/api/sessions/${sessionId}/stop`)).status).toBe(200);
    expect((await get(`/api/sessions/${sessionId}`)).status).toBe("stopped");
    expect((await post(`/api/sessions/${sessionId}/interrupt`)).status).toBe(409);
  });

  test("A2: sending to a finished conversation resumes it under the same session ID", async () => {
    const res = await (await post(`/api/sessions/${OLD}/send`, { text: "carry on", permissionMode: "plan" })).json();
    expect(res).toMatchObject({ sessionId: OLD, resumed: true });
    const q = queries.at(-1)!;
    expect(q.options.resume).toBe(OLD);
    expect(q.options.sessionId).toBeUndefined();
    expect(q.options.permissionMode).toBe("plan");
    await until(() => q.received.length === 1);
    expect((await get(`/api/sessions/${OLD}`)).liveId).toBe(res.liveId);
    // Now Control Center has started it, so it's no longer taken for a script run.
    await until(async () => (await get("/api/sessions?empty=1")).find((s: any) => s.sessionId === OLD).fromScript === false);
    // A second message goes to the running session; after Stop, the next one resumes again with the same ID.
    expect((await (await post(`/api/sessions/${OLD}/send`, { text: "more" })).json()).resumed).toBe(false);
    await post(`/api/sessions/${OLD}/stop`);
    const again = await (await post(`/api/sessions/${OLD}/send`, { text: "back again" })).json();
    expect(again).toMatchObject({ sessionId: OLD, resumed: true });
    expect(queries.at(-1)!.options).toMatchObject({ resume: OLD, permissionMode: "plan" });
    // Only one live session per conversation.
    expect((await get("/api/live")).filter((l: any) => l.sessionId === OLD)).toHaveLength(1);
    await post(`/api/sessions/${OLD}/stop`);
  });

  test("A4: approvals and questions wait in the conversation's live state and are answered by session ID", async () => {
    const { sessionId } = await (await post("/api/sessions/new", { project: "~/projects/demo", prompt: "make a file", permissionMode: "default" })).json();
    await until(async () => (await get(`/api/sessions/${sessionId}`)).pending.length === 1);
    const waiting = await get(`/api/sessions/${sessionId}`);
    expect(waiting.status).toBe("waiting");
    expect(waiting.pending[0]).toMatchObject({ requestId: "req-write", type: "approval", toolName: "Write" });
    expect((await post(`/api/sessions/${sessionId}/respond`, { requestId: "nope", decision: "allow" })).status).toBe(409);
    expect((await post(`/api/sessions/${sessionId}/respond`, { requestId: "req-write", decision: "allow" })).status).toBe(200);
    await until(async () => (await get(`/api/sessions/${sessionId}`)).status === "idle");

    await post(`/api/sessions/${sessionId}/send`, { text: "ask me" });
    await until(async () => (await get(`/api/sessions/${sessionId}`)).pending[0]?.type === "question");
    await post(`/api/sessions/${sessionId}/respond`, { requestId: "req-ask", decision: "allow", answers: { "Which name?": "b" } });
    await until(async () => (await get(`/api/sessions/${sessionId}`)).status === "idle");
    const { getSession } = await import("../src/live/sessions");
    const texts = getSession((await get(`/api/sessions/${sessionId}`)).liveId)!
      .view()
      .events.filter((e) => e.kind === "text")
      .map((e: any) => e.text);
    expect(texts).toContain("write allow");
    expect(texts).toContain('answered {"Which name?":"b"}');

    expect((await post(`/api/sessions/${sessionId}/mode`, { mode: "nonsense" })).status).toBe(400);
    expect((await post(`/api/sessions/${sessionId}/mode`, { mode: "acceptEdits" })).status).toBe(200);
    expect((await get(`/api/sessions/${sessionId}`)).permissionMode).toBe("acceptEdits");
    expect((await post(`/api/sessions/${sessionId}/model`, { model: "a b" })).status).toBe(400);
    expect((await post(`/api/sessions/${sessionId}/model`, { model: "haiku" })).status).toBe(200);
    expect(queries.at(-1)!.model).toBe("haiku");
    expect((await get(`/api/sessions/${sessionId}`)).model).toBe("haiku");
    await post(`/api/sessions/${sessionId}/stop`);
    expect((await post(`/api/sessions/${sessionId}/respond`, { requestId: "x", decision: "allow" })).status).toBe(409);
  });

  test("a new conversation's first message shows before Claude Code writes the transcript", async () => {
    const { sessionId } = await (await post("/api/sessions/new", { project: "~/projects/demo", prompt: "slow first words" })).json();
    const one = await get(`/api/sessions/${sessionId}`);
    expect(one.turns.map((t: any) => [t.role, t.blocks[0].text])).toEqual([["user", "slow first words"]]);
    await post(`/api/sessions/${sessionId}/stop`);
    release();
  });

  describe("sending right after stopping a new conversation", () => {
    beforeAll(async () => (await import("../src/live/sessions")).setTranscriptWaitForTests(600));
    afterAll(async () => (await import("../src/live/sessions")).setTranscriptWaitForTests(null));

    test("waits for the transcript the stopped Claude is still writing, then resumes it", async () => {
      const { sessionId } = await (await post("/api/sessions/new", { project: "~/projects/demo", prompt: "slow poem" })).json();
      await post(`/api/sessions/${sessionId}/stop`);
      const before = queries.length;
      const sent = await (await post(`/api/sessions/${sessionId}/send`, { text: "AGAIN" })).json();
      expect(sent).toMatchObject({ sessionId, resumed: true });
      expect(queries.length).toBe(before); // nothing resumed yet: there's no transcript to resume
      await Bun.sleep(100);
      await writeFile(join(root, ".claude", "projects", "-demo", `${sessionId}.jsonl`), JSON.stringify({ type: "user", sessionId, cwd: join(root, "projects", "demo"), message: { role: "user", content: "slow poem" } }) + "\n");
      await until(() => queries.length === before + 1);
      const q = queries.at(-1)!;
      expect(q.options.resume).toBe(sessionId);
      await until(() => q.received.length === 1);
      expect(q.received).toEqual(["AGAIN"]);
      await post(`/api/sessions/${sessionId}/stop`);
      release();
    });

    test("starts afresh under the same ID when the stopped Claude never wrote one", async () => {
      const { sessionId } = await (await post("/api/sessions/new", { project: "~/projects/demo", prompt: "slow poem" })).json();
      await post(`/api/sessions/${sessionId}/stop`);
      const before = queries.length;
      await post(`/api/sessions/${sessionId}/send`, { text: "AGAIN" });
      await until(() => queries.length === before + 1);
      const q = queries.at(-1)!;
      expect(q.options.resume).toBeUndefined();
      expect(q.options.sessionId).toBe(sessionId);
      await until(() => q.received.length === 1);
      expect(q.received).toEqual(["AGAIN"]);
      await until(async () => (await get(`/api/sessions/${sessionId}`)).status === "idle");
      await post(`/api/sessions/${sessionId}/stop`);
    });
  });

  test("the overview names the conversation a waiting request belongs to", async () => {
    const { sessionId } = await (await post("/api/sessions/new", { project: "~/projects/demo", prompt: "make a file" })).json();
    await until(async () => (await get("/api/overview")).needsYou.some((n: any) => n.sessionId === sessionId));
    await post(`/api/sessions/${sessionId}/stop`);
  });
});
