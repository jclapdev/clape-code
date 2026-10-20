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

