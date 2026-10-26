import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let root: string;
let claude: string;
let proj: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cc-test-"));
  claude = join(root, ".claude");
  proj = join(root, "projects", "demo");
  process.env.CC_HOME = root;
  process.env.CC_CLAUDE_DIR = claude;
  process.env.CC_APP_DIR = join(root, "app");
  await mkdir(join(claude, "commands"), { recursive: true });
  await mkdir(join(claude, "sessions"), { recursive: true });
  await mkdir(join(claude, "skills", "synced", "x"), { recursive: true });
  await mkdir(join(proj, ".claude", "agents"), { recursive: true });
  await writeFile(join(claude, "settings.json"), '{"model":"opus"}');
  await writeFile(join(claude, "commands", "hello.md"), "---\ndescription: hi\n---\nbody\n");
  await writeFile(join(proj, ".claude", "agents", "reader.md"), "---\nname: reader\n---\n");
});
afterAll(() => rm(root, { recursive: true, force: true }));

describe("policy", async () => {
  const { classify, setProjectDirs } = await import("../src/fs/policy");
  test("classifies paths", () => {
    setProjectDirs([proj]);
    expect(classify(join(claude, "settings.json"))).toBe("edit");
    expect(classify(join(claude, "commands", "hello.md"))).toBe("edit");
    expect(classify(join(claude, "projects", "-x", "memory", "a.md"))).toBe("edit");
    expect(classify(join(claude, "projects", "-x", "s.jsonl"))).toBe("app");
    expect(classify(join(claude, "skills", "synced", "x", "SKILL.md"))).toBe("app");
    expect(classify(join(claude, "sessions", "1.abc.key"))).toBe("secret");
    expect(classify(join(claude, "daemon", "control.key"))).toBe("secret");
    expect(classify(join(root, ".claude.json"))).toBe("secret");
    expect(classify(join(proj, "BACKLOG.md"))).toBe("edit");
    expect(classify(join(proj, ".git", "config"))).toBe("app");
    expect(classify(join(root, "elsewhere.txt"))).toBe("outside");
  });
  test("workflows, scheduled tasks and themes are editable", () => {
    expect(classify(join(claude, "workflows", "triage.js"))).toBe("edit");
    expect(classify(join(claude, "scheduled-tasks", "daily-review", "SKILL.md"))).toBe("edit");
    expect(classify(join(claude, "themes", "dusk.json"))).toBe("edit");
    expect(classify(join(claude, "workflows-old", "x.js"))).toBe("app");
  });
  test("the backlog for all projects is editable", () => {
    expect(classify(join(claude, "BACKLOG.md"))).toBe("edit");
    expect(classify(join(claude, "projects", "BACKLOG.md"))).toBe("app");
  });
  test("agent memory, keyboard shortcuts and .worktreeinclude are editable", () => {
    expect(classify(join(claude, "agent-memory", "code-reviewer", "MEMORY.md"))).toBe("edit");
    expect(classify(join(proj, ".claude", "agent-memory", "tester", "MEMORY.md"))).toBe("edit");
    expect(classify(join(proj, ".claude", "agent-memory-local", "tester", "notes.md"))).toBe("edit");
    expect(classify(join(claude, "keybindings.json"))).toBe("edit");
    expect(classify(join(proj, ".worktreeinclude"))).toBe("edit");
    expect(classify(join(claude, "agent-memory-old", "x.md"))).toBe("app");
  });
});

describe("safeWrite", async () => {
  const { safeWrite, readWithHash, WriteError } = await import("../src/fs/safeWrite");
  const file = () => join(claude, "settings.json");

  test("writes, backs up and returns the new hash", async () => {
    const cur = (await readWithHash(file()))!;
    const res = await safeWrite(file(), '{"model":"sonnet"}', cur.hash);
    expect(await readFile(file(), "utf8")).toBe('{"model":"sonnet"}');
    expect(await readFile(res.backupPath!, "utf8")).toBe('{"model":"opus"}');
    expect(res.hash).toBe((await readWithHash(file()))!.hash);
  });

  test("refuses when the file changed since it was opened", async () => {
    const stale = (await readWithHash(file()))!.hash;
    await writeFile(file(), '{"model":"haiku"}');
    const err = await safeWrite(file(), "{}", stale).catch((e) => e);
    expect(err).toBeInstanceOf(WriteError);
    expect(err.status).toBe(409);
    expect(err.current.content).toBe('{"model":"haiku"}');
    expect(await readFile(file(), "utf8")).toBe('{"model":"haiku"}');
  });

  test("rejects invalid JSON and bad frontmatter", async () => {
    const h = (await readWithHash(file()))!.hash;
    expect((await safeWrite(file(), "{nope", h).catch((e) => e)).status).toBe(400);
    const cmd = join(claude, "commands", "hello.md");
    const ch = (await readWithHash(cmd))!.hash;
    expect((await safeWrite(cmd, "---\ndescription: no closing fence\nbody\n", ch).catch((e) => e)).status).toBe(400);
    // Values YAML rejects but Claude Code accepts must still save.
    const ok = await safeWrite(cmd, "---\ndescription: hi\nargument-hint: [name] [--project | --personal]\n---\nbody\n", ch);
    expect(ok.hash).toBeTruthy();
  });

  test("refuses files Claude Code owns and files outside", async () => {
    expect((await safeWrite(join(claude, "history.jsonl"), "x", null).catch((e) => e)).status).toBe(403);
    expect((await safeWrite(join(root, "x.txt"), "x", null).catch((e) => e)).status).toBe(403);
  });

  test("creates new files when expected hash is null", async () => {
    const p = join(claude, "commands", "new.md");
    await safeWrite(p, "hello", null);
    expect(await readFile(p, "utf8")).toBe("hello");
    expect((await safeWrite(p, "again", null).catch((e) => e)).status).toBe(409);
  });
});

describe("archive", async () => {
  const { archiveItem, listArchive, restoreItem } = await import("../src/fs/archive");
  test("archives and restores a project agent", async () => {
    const p = join(proj, ".claude", "agents", "reader.md");
    const rec = await archiveItem(p, "agent");
    expect(await readdir(join(proj, ".claude", "agents"))).toEqual([]);
    expect((await listArchive()).map((r) => r.id)).toContain(rec.id);
    await restoreItem(rec.id);
    expect(await readFile(p, "utf8")).toBe("---\nname: reader\n---\n");
    expect(await listArchive()).toEqual([]);
  });
  test("refuses to archive synced skills", async () => {
    expect((await archiveItem(join(claude, "skills", "synced", "x"), "skill").catch((e) => e)).status).toBe(403);
  });
});
