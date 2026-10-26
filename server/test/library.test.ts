import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentMemoryItems, globalLibrary, listThemes, pluginFiles, parseKeybindings, parseWorktreeInclude, projectLibrary, readKeybindings, readWorktreeInclude } from "../src/scan/library";

let root: string;
let claude: string;
let proj: string;
const saved = { home: process.env.CC_HOME, claude: process.env.CC_CLAUDE_DIR };

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cc-lib-"));
  claude = join(root, ".claude");
  proj = join(root, "projects", "demo");
  process.env.CC_HOME = root;
  process.env.CC_CLAUDE_DIR = claude;
  await mkdir(join(claude, "agent-memory", "code-reviewer"), { recursive: true });
  await mkdir(join(claude, "themes"), { recursive: true });
  await mkdir(join(proj, ".claude", "agent-memory", "tester"), { recursive: true });
  await mkdir(join(proj, ".claude", "agent-memory-local", "tester"), { recursive: true });
  await writeFile(join(claude, "agent-memory", "code-reviewer", "MEMORY.md"), "- [Naming](naming.md)\n");
  await writeFile(join(claude, "agent-memory", "code-reviewer", "naming.md"), "---\nname: Naming\ndescription: How this team names things\n---\nUse kebab-case.\n");
  await writeFile(join(claude, "agent-memory", "code-reviewer", "notes.txt"), "not a note");
  await writeFile(join(claude, "agent-memory", "stray.md"), "a file outside any agent folder");
  await writeFile(join(proj, ".claude", "agent-memory", "tester", "MEMORY.md"), "shared\n");
  await writeFile(join(proj, ".claude", "agent-memory-local", "tester", "flaky.md"), "private\n");
  await writeFile(join(claude, "themes", "dracula.json"), JSON.stringify({ name: "Dracula", base: "dark", overrides: { claude: "#bd93f9", error: "#ff5555" } }));
  await writeFile(join(claude, "themes", "broken.json"), "{ nope");
  await writeFile(join(claude, "themes", "README.md"), "not a theme");
  await writeFile(
    join(claude, "keybindings.json"),
    JSON.stringify({ $schema: "https://www.schemastore.org/claude-code-keybindings.json", bindings: [{ context: "Chat", bindings: { "ctrl+e": "chat:externalEditor", "ctrl+s": null } }] }),
  );
  await writeFile(join(proj, ".worktreeinclude"), "# Local environment\n.env\n.env.local\n\n# API credentials\nconfig/secrets.json  \n");
});
afterAll(async () => {
  process.env.CC_HOME = saved.home;
  process.env.CC_CLAUDE_DIR = saved.claude;
  if (saved.home === undefined) delete process.env.CC_HOME;
  if (saved.claude === undefined) delete process.env.CC_CLAUDE_DIR;
  await rm(root, { recursive: true, force: true });
});

describe("agent memory", () => {
  test("reads each agent's notes and skips other files", async () => {
    const items = await agentMemoryItems(join(claude, "agent-memory"), "user", "user", null);
    expect(items.map((i) => [i.name, i.meta.agent, i.meta.scope]).sort()).toEqual([
      ["MEMORY.md (index)", "code-reviewer", "user"],
      ["Naming", "code-reviewer", "user"],
    ]);
    expect(items.find((i) => i.name === "Naming")!.description).toBe("How this team names things");
    expect(items.every((i) => i.kind === "memory" && i.access === "edit")).toBe(true);
  });
  test("a missing folder gives no notes", async () => {
    expect(await agentMemoryItems(join(root, "nowhere"), "user", "user", null)).toEqual([]);
  });
  test("user-level notes come with the global library", async () => {
    const { items } = await globalLibrary();
    expect(items.filter((i) => i.meta.agent === "code-reviewer")).toHaveLength(2);
  });
  test("a project's shared and local notes come with its library", async () => {
    const mem = (await projectLibrary(proj)).filter((i) => i.kind === "memory");
    expect(mem.map((i) => [i.name, i.meta.agent, i.meta.scope, i.sourceName]).sort()).toEqual([
      ["MEMORY.md (index)", "tester", "project", "demo"],
      ["flaky", "tester", "local", "demo"],
    ]);
  });
});

describe("keyboard shortcuts", () => {
  test("parses blocks, keeping unbound keys as null", () => {
    expect(parseKeybindings({ bindings: [{ context: "Chat", bindings: { "ctrl+e": "chat:externalEditor", "ctrl+s": null } }] })).toEqual([
      { context: "Chat", bindings: [{ key: "ctrl+e", action: "chat:externalEditor" }, { key: "ctrl+s", action: null }] },
    ]);
  });
  test("skips malformed blocks", () => {
    expect(parseKeybindings({ bindings: [{ bindings: { a: "x" } }, { context: "Chat" }, null, "x"] })).toEqual([]);
    expect(parseKeybindings({})).toEqual([]);
    expect(parseKeybindings(null)).toEqual([]);
  });
  test("reads ~/.claude/keybindings.json", async () => {
    const k = await readKeybindings();
    expect(k.exists).toBe(true);
    expect(k.error).toBeNull();
    expect(k.access).toBe("edit");
    expect(k.blocks[0]!.bindings).toHaveLength(2);
  });
});

describe("themes", () => {
  test("lists each .json theme with its base and how many colours it changes", async () => {
    const themes = await listThemes();
    expect(themes.map((t) => [t.slug, t.name, t.base, t.overrides, t.error === null])).toEqual([
      ["broken", "broken", null, 0, false],
      ["dracula", "Dracula", "dark", 2, true],
    ]);
    expect(themes.every((t) => t.access === "edit")).toBe(true);
  });
});

describe(".worktreeinclude", () => {
  test("keeps patterns and drops comments, blank lines and trailing spaces", () => {
    expect(parseWorktreeInclude("# Local environment\r\n.env\n\n  \n# x\n.env.local  \nconfig/secrets.json\n")).toEqual([".env", ".env.local", "config/secrets.json"]);
  });
  test("keeps an escaped trailing space and an escaped #", () => {
    expect(parseWorktreeInclude("name\\ \n\\#notes\n")).toEqual(["name\\ ", "\\#notes"]);
  });
  test("reads a project's file, or reports it missing", async () => {
    expect((await readWorktreeInclude(proj)).patterns).toEqual([".env", ".env.local", "config/secrets.json"]);
    expect(await readWorktreeInclude(join(root, "projects"))).toMatchObject({ exists: false, patterns: [] });
  });
});

describe("plugin files", () => {
  test("leaves out Claude Code's .in_use lock files and .orphaned_at marker", async () => {
    const pl = join(root, "plugin");
    await mkdir(join(pl, ".in_use", "1234"), { recursive: true });
    await mkdir(join(pl, ".claude-plugin"), { recursive: true });
    await writeFile(join(pl, ".in_use", "1234", "lock"), "");
    await writeFile(join(pl, ".orphaned_at"), "1792540077994");
    await writeFile(join(pl, ".claude-plugin", "plugin.json"), "{}");
    await writeFile(join(pl, "README.md"), "");
    expect(await pluginFiles(pl)).toEqual([".claude-plugin/plugin.json", "README.md"]);
  });
});
