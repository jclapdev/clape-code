// Account status, sign-in and session accounts, against a fake `claude` (fixtures/fake-claude.ts).
// Nothing here runs the real Claude Code or touches the real login.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installFakeClaude } from "./fakeClaude";
import { pickStatus, readAccount } from "../src/account/status";

let root: string;
let log: string;
const saved = { ...process.env };

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cc-account-"));
  await mkdir(join(root, "claude"), { recursive: true });
  await mkdir(join(root, "bedrock-proj"), { recursive: true });
  log = join(root, "calls.log");
  await installFakeClaude(root);
  process.env.FAKE_CLAUDE_LOG = log;
});
afterAll(async () => {
  for (const k of ["CC_CLAUDE_BIN", "FAKE_CLAUDE_LOG", "CC_CLAUDE_DIR"]) if (saved[k] === undefined) delete process.env[k];
  await rm(root, { recursive: true, force: true });
});
beforeEach(() => {
  process.env.CC_CLAUDE_DIR = join(root, "claude");
});

const calls = async () => (await readFile(log, "utf8").catch(() => "")).trim().split("\n").filter(Boolean);

describe("account status", () => {
  test("status keeps only the picked fields", () => {
    const v = pickStatus({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", email: "me@example.com", orgId: "org-1", orgName: "Acme", subscriptionType: "pro", configDirectory: "/x", projectsDirectory: "/x/p", analyticsDisabled: false, accessToken: "sk-ant" });
    expect(Object.keys(v).sort()).toEqual(["email", "loggedIn", "method", "methodName", "organization", "plan", "provider", "providerName"]);
    expect(JSON.stringify(v)).not.toContain("org-1");
    expect(JSON.stringify(v)).not.toContain("sk-ant");
  });

  test("status names methods, providers and plans", () => {
    const claude = pickStatus({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", subscriptionType: "pro" });
    expect(claude.methodName).toBe("Claude account");
    expect(claude.plan).toBe("Claude Pro");
    expect(pickStatus({ loggedIn: true, authMethod: "claude.ai", subscriptionType: "max" }).plan).toBe("Claude Max");
    expect(pickStatus({ loggedIn: true, authMethod: "api_key" }).methodName).toBe("API key");
    expect(pickStatus({ loggedIn: false, authMethod: "none" }).methodName).toBe("Not signed in");
    const bedrock = pickStatus({ loggedIn: true, authMethod: "third_party", apiProvider: "bedrock" });
    expect(bedrock.providerName).toBe("Amazon Bedrock");
    expect(bedrock.methodName).toBe("Amazon Bedrock");
  });

  test("bedrock status shows the provider without signed in", () => {
    const v = pickStatus({ loggedIn: true, authMethod: "third_party", apiProvider: "bedrock" });
    expect(v.loggedIn).toBeNull();
    expect(v.provider).toBe("bedrock");
  });

  test("account says when Claude Code is missing", async () => {
    const bin = process.env.CC_CLAUDE_BIN;
    process.env.CC_CLAUDE_BIN = join(root, "no-such-claude");
    try {
      const v = await readAccount();
      expect(v.installed).toBe(false);
      expect(v.problem).toContain("Claude Code isn't installed");
    } finally {
      process.env.CC_CLAUDE_BIN = bin;
    }
  });

  test("auth commands use the app's Claude folder", async () => {
    await readAccount();
    const last = (await calls()).at(-1)!;
    expect(last.startsWith("auth status --json|")).toBe(true);
    expect(last.endsWith(`|${join(root, "claude")}`)).toBe(true);
  });

  test("project account runs in the project folder", async () => {
    const v = await readAccount(join(root, "bedrock-proj"));
    expect(v.provider).toBe("bedrock");
    expect((await calls()).at(-1)!.split("|")[1]).toContain("bedrock-proj");
  });
});

describe("sign-in and sign-out", () => {
  const { cancelLogin, loginState, logout, sendCode, startLogin } = require("../src/account/login") as typeof import("../src/account/login");
  const loggedOut = () => Bun.file(join(root, "claude", "fake-logged-out")).exists();
  const until = async (fn: () => boolean) => {
    for (let i = 0; i < 100 && !fn(); i++) await Bun.sleep(30);
  };

  test("sign-in returns the printed address", async () => {
    const s = await startLogin();
    expect(s.state).toBe("waiting");
    expect(s.url).toBe("https://claude.com/cai/oauth/authorize?code=true&state=abc");
    expect((await calls()).at(-1)!.split("|")[0]).toBe("auth login --claudeai");
    cancelLogin();
  });

  test("a pasted code finishes sign-in", async () => {
    await Bun.write(join(root, "claude", "fake-logged-out"), "");
    await startLogin();
    expect(sendCode("good#code").state).toBe("checking");
    await until(() => loginState().state !== "checking");
    expect(loginState()).toEqual({ state: "done", url: null, message: "Login successful." });
    expect(await loggedOut()).toBe(false);
  });

  test("a failed sign-in shows Claude Code's message", async () => {
    await startLogin();
    sendCode("wrong#code");
    await until(() => loginState().state !== "checking");
    expect(loginState().state).toBe("failed");
    expect(loginState().message).toBe("Login failed: Request failed with status code 400");
  });

  test("an invalid code lets you paste again", async () => {
    await startLogin();
    sendCode("no-hash-code");
    await until(() => loginState().state !== "checking");
    expect(loginState()).toMatchObject({ state: "waiting", message: "Invalid code. Please make sure the full code was copied." });
    expect(loginState().url).toStartWith("https://");
    sendCode("good#code");
    await until(() => loginState().state !== "checking");
    expect(loginState().state).toBe("done");
  });

  test("bad codes are refused", async () => {
    await startLogin();
    for (const bad of ["", "   ", "a".repeat(2001), "abc\ndef"]) expect(() => sendCode(bad)).toThrow();
    expect(loginState().state).toBe("waiting");
    cancelLogin();
  });

  test("one sign-in at a time and cancel stops it", async () => {
    await startLogin();
    const { pid: first } = require("../src/account/login").currentProcess();
    await startLogin();
    const { pid: second } = require("../src/account/login").currentProcess();
    expect(second).not.toBe(first);
    expect(() => process.kill(first, 0)).toThrow(); // the first run was stopped
    cancelLogin();
    expect(loginState().state).toBe("idle");
    await until(() => {
      try {
        process.kill(second, 0);
        return false;
      } catch {
        return true;
      }
    });
    expect(() => process.kill(second, 0)).toThrow();
  });

  test("sign-in stops after the time limit", async () => {
    await startLogin({ timeoutMs: 200 });
    await until(() => loginState().state !== "waiting");
    expect(loginState().state).toBe("failed");
    expect(loginState().message).toContain("took too long");
  });

  test("sign-in state sends no other output", async () => {
    const s = await startLogin();
    expect(Object.keys(s).sort()).toEqual(["message", "state", "url"]);
    expect(JSON.stringify(s)).not.toContain("Opening browser");
    expect(JSON.stringify(s)).not.toContain("Paste code");
    cancelLogin();
  });

  test("sign-out runs claude auth logout", async () => {
    const r = await logout();
    expect(r.message).toBe("Successfully logged out from your Anthropic account.");
    expect((await calls()).at(-1)!.split("|")[0]).toBe("auth logout");
    expect(await loggedOut()).toBe(true);
    await Bun.write(join(root, "claude", "fake-logged-out"), "").then(() => Bun.file(join(root, "claude", "fake-logged-out")).delete());
  });

  test("sign-out refused for other methods", async () => {
    process.env.FAKE_CLAUDE_BEDROCK = "1";
    try {
      await expect(logout()).rejects.toThrow("Claude account");
      expect((await calls()).at(-1)!.split("|")[0]).toBe("auth status --json");
    } finally {
      delete process.env.FAKE_CLAUDE_BEDROCK;
    }
  });

  test("sign-in and sign-out say when Claude Code is missing", async () => {
    const bin = process.env.CC_CLAUDE_BIN;
    process.env.CC_CLAUDE_BIN = join(root, "no-such-claude");
    try {
      await expect(startLogin()).rejects.toThrow("Claude Code isn't installed");
      await expect(logout()).rejects.toThrow("Claude Code isn't installed");
    } finally {
      process.env.CC_CLAUDE_BIN = bin;
    }
  });
});
