// The real API, against a fixture home folder seeded with secrets: nothing secret may come back,
// and the login lockout can't be reset with a client-set header.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile, copyFile } from "node:fs/promises";
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
