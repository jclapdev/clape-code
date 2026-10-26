import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { addItem, editItemText, parseBacklog, toggleItem } from "../src/parsers/backlog";
import { addEntry, parseChangelog } from "../src/parsers/changelog";
import { effective } from "../src/parsers/settings";
import { summarize, toTurns } from "../src/parsers/transcript";

const BACKLOG = `# Backlog

Fix these in order before building more topics.

## Structure

- [x] 1. Split each topic into short lessons.
- [ ] 2. Replace the four tabs.

## Then

Some intro text.

- [ ] 3. Build the remaining topics.
`;

describe("backlog", () => {
  test("parses sections, numbers and checkboxes", () => {
    const b = parseBacklog(BACKLOG);
    expect(b.title).toBe("Backlog");
    expect(b.intro).toBe("Fix these in order before building more topics.");
    expect(b.sections.map((s) => s.name)).toEqual(["Structure", "Then"]);
    expect(b.sections[1].intro).toBe("Some intro text.");
    expect(b.sections[0].items[0]).toEqual({ line: 6, done: true, n: 1, text: "Split each topic into short lessons." });
    expect(b.numbered && b.checkboxes).toBe(true);
  });

  test("toggle changes only that line", () => {
    const out = toggleItem(BACKLOG, 7);
    const a = BACKLOG.split("\n");
    const b = out.split("\n");
    expect(b[7]).toBe("- [x] 2. Replace the four tabs.");
    expect(b.filter((l, i) => l !== a[i]).length).toBe(1);
    expect(toggleItem(out, 7)).toBe(BACKLOG);
  });

  test("edit keeps the checkbox and number", () => {
    expect(editItemText(BACKLOG, 7, "Replace tabs").split("\n")[7]).toBe("- [ ] 2. Replace tabs");
  });

  test("add continues numbering across sections", () => {
    const out = addItem(BACKLOG, 4, "New thing");
    expect(out.split("\n")[8]).toBe("- [ ] 4. New thing");
  });

  test("plain bullet backlog stays plain", () => {
    const plain = "# Backlog\n\n- First idea\n";
    expect(parseBacklog(plain).sections[0].items[0].done).toBeNull();
    expect(addItem(plain, -1, "Second")).toBe("# Backlog\n\n- First idea\n- Second\n");
  });

  test("keeps Windows line endings", () => {
    const crlf = BACKLOG.replace(/\n/g, "\r\n");
    expect(toggleItem(crlf, 7)).toContain("\r\n- [x] 2. Replace the four tabs.\r\n");
  });
});

describe("frontmatter", async () => {
  const { parseFrontmatter } = await import("../src/parsers/frontmatter");
  test("strict YAML", () => {
    expect(parseFrontmatter("---\nname: a\npaths:\n  - x\n---\nbody")).toEqual({ data: { name: "a", paths: ["x"] }, body: "body", error: null });
  });
  test("values YAML rejects are read the way Claude Code reads them", () => {
    const f = parseFrontmatter("---\ndescription: Create a skill\nargument-hint: [skill-name] [--project | --personal]\n---\n\n# Body\n");
    expect(f.error).toBeNull();
    expect(f.data).toEqual({ description: "Create a skill", "argument-hint": "[skill-name] [--project | --personal]" });
    expect(f.body).toBe("\n# Body\n");
  });
  test("broken frontmatter is reported", () => {
    expect(parseFrontmatter("---\nname: a\nno fence").error).toContain("closing");
    expect(parseFrontmatter("---\n: : :\n  [\n---\n").error).not.toBeNull();
    expect(parseFrontmatter("no frontmatter").error).toBeNull();
  });
});

const CHANGELOG = `# What's new

Changes to the app, newest first.

## 15 October 2026

- The lab now starts reliably.
`;

describe("changelog", () => {
  test("adds a new day above the newest", () => {
    const out = addEntry(CHANGELOG, "A new thing.", new Date(2026, 9, 17));
    expect(out).toContain("first.\n\n## 17 October 2026\n\n- A new thing.\n\n## 15 October 2026");
    expect(parseChangelog(out).days[0]).toEqual({ date: "17 October 2026", line: 4, entries: ["A new thing."], kinds: [null] });
  });

  test("appends under an existing day", () => {
    const out = addEntry(CHANGELOG, "Second.", new Date(2026, 9, 15));
    expect(out.endsWith("- The lab now starts reliably.\n- Second.\n")).toBe(true);
  });

  const KEEP = "# Changelog\n\nIntro.\n\n## Unreleased\n\n### Added\n\n- Search.\n\n### Fixed\n\n- Home count.\n\n## 2026-10-17\n\n### Added\n\n- First version.\n\n\n\n- odd spacing kept\n";

  test("Keep a Changelog: a change joins its group under Unreleased", () => {
    const out = addEntry(KEEP, "Guides.", new Date(2026, 9, 18), "Added");
    expect(out).toBe(KEEP.replace("- Search.\n", "- Search.\n- Guides.\n"));
    const un = parseChangelog(out).days[0]!;
    expect(un.date).toBe("Unreleased");
    expect(un.entries).toEqual(["Search.", "Guides.", "Home count."]);
    expect(un.kinds).toEqual(["Added", "Added", "Fixed"]);
  });

  test("Keep a Changelog: a missing group is created in the standard order, other lines untouched", () => {
    const out = addEntry(KEEP, "Menu.", new Date(2026, 9, 18), "Changed");
    expect(out).toBe(KEEP.replace("### Fixed", "### Changed\n\n- Menu.\n\n### Fixed"));
    const removed = addEntry(KEEP, "Palette.", new Date(2026, 9, 18), "Security");
    expect(removed).toBe(KEEP.replace("- Home count.\n\n## 2026", "- Home count.\n\n### Security\n\n- Palette.\n\n## 2026"));
  });
});

describe("settings", () => {
  test("invalid JSON names the line", async () => {
    const { validate } = await import("../src/fs/safeWrite");
    let msg = "";
    try {
      validate("/x/settings.json", '{\n  "a": 1,\n  "b": }\n');
    } catch (e: any) {
      msg = e.message;
    }
    expect(msg).toBe('This isn\'t valid JSON. Line 3 has a mistake near: "b": }');
  });
  const eff = effective({
    user: { model: "opus", permissions: { allow: ["Read"] }, hooks: { Stop: [{ a: 1 }] } },
    project: { permissions: { allow: ["Bash(ls)"] }, hooks: { Stop: [{ b: 2 }], PreToolUse: [{ c: 3 }] } },
    local: { model: "sonnet", skillOverrides: { docx: "off" } },
  });
  const get = (k: string) => eff.find((e) => e.key === k)!;

  test("scalars: highest file wins and the rest are overridden", () => {
    expect(get("model")).toMatchObject({ value: "sonnet", from: "local", setIn: ["local", "user"] });
    expect(get("model").overridden).toEqual([{ source: "user", value: "opus" }]);
  });
  test("lists combine", () => {
    expect(get("permissions.allow")).toMatchObject({ value: ["Bash(ls)", "Read"], from: "combined" });
  });
  test("hook events merge per event", () => {
    expect(get("hooks").value).toEqual({ Stop: [{ b: 2 }, { a: 1 }], PreToolUse: [{ c: 3 }] });
  });
});

const line = (o: object) => JSON.stringify(o);
const TRANSCRIPT = [
  line({ type: "user", sessionId: "s1", cwd: "/p/a", timestamp: "2026-10-17T10:00:00Z", message: { role: "user", content: "Fix the lab" } }),
  line({ type: "assistant", timestamp: "2026-10-17T10:00:05Z", message: { id: "m1", model: "claude-opus-5-5", content: [{ type: "text", text: "Looking." }], usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 50 } } }),
  line({ type: "assistant", timestamp: "2026-10-17T10:00:06Z", message: { id: "m1", model: "claude-opus-5-5", content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } }], usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 50 } } }),
  line({ type: "user", timestamp: "2026-10-17T10:00:07Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "a.txt" }] }, toolUseResult: {} }),
  line({ type: "user", isMeta: true, message: { role: "user", content: "<system-reminder>x</system-reminder>" } }),
  line({ type: "ai-title", aiTitle: "lab-fix", sessionId: "s1" }),
  line({ type: "cost-state", totalCostUSD: 0.42 }),
  "not json",
].join("\n");

describe("transcript", () => {
  test("counts usage once per message id", () => {
    const s = summarize(TRANSCRIPT, "fallback");
    expect(s.sessionId).toBe("s1");
    expect(s.usage).toEqual({ input: 10, output: 5, cacheRead: 100, cacheWrite: 50 });
    expect(s.assistantMessages).toBe(1);
    expect(s.toolCalls).toBe(1);
    expect(s.prompts).toBe(1);
    expect(s.title).toBe("lab-fix");
    expect(s.costUSD).toBe(0.42);
    expect(s.cwd).toBe("/p/a");
  });

  test("title: the name you set, then the AI title, then the conversation summary", () => {
    const sum = line({ type: "summary", summary: "Fixing the lab", leafUuid: "u1" });
    const named = line({ type: "custom-title", customTitle: "my lab", sessionId: "s1" });
    expect(summarize([TRANSCRIPT, sum].join("\n"), "f").title).toBe("lab-fix");
    expect(summarize([TRANSCRIPT, sum, named].join("\n"), "f").title).toBe("my lab");
    expect(summarize([TRANSCRIPT.split("\n")[0], sum].join("\n"), "f").title).toBe("Fixing the lab");
    expect(summarize(TRANSCRIPT.split("\n")[0], "f").title).toBeNull();
  });

  test("a title from the first prompt never starts with user:", async () => {
    const { untitled } = await import("../src/db/index");
    // Real first prompts from `claude -p` runs on John's computer, which pass a transcript as the prompt.
    expect(untitled("user: The next button sucks. Its hard to look at")).toBe("The next button sucks. Its hard to look at");
    expect(untitled("user: <command-name>/clear</command-name>\n            <command-message>clear</command-message>")).toBe("/clear");
    expect(untitled("User:\nReview the pending changes")).toBe("Review the pending changes");
    expect(untitled("Fix the user: field")).toBe("Fix the user: field");
    expect(untitled(null)).toBe("Untitled session");
  });

  test("search text holds prompts and Claude's replies in order", () => {
    expect(summarize(TRANSCRIPT, "f").searchText).toBe("Fix the lab\n\nLooking.");
  });

  test("streaming lines gives the same summary as reading the whole file", async () => {
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { readLines } = await import("../src/fs/lines");
    const { Summarizer } = await import("../src/parsers/transcript");
    const dir = await mkdtemp(join(tmpdir(), "cc-lines-"));
    // Long multi-byte lines so characters straddle the stream's chunk boundaries.
    const big = [TRANSCRIPT, ...Array.from({ length: 400 }, (_, i) => line({ type: "user", message: { role: "user", content: `ünïcødé ${"é".repeat(3000)} ${i}` } }))].join("\n");
    const file = join(dir, "t.jsonl");
    await writeFile(file, big);
    const lines: string[] = [];
    for await (const l of readLines(file)) lines.push(l);
    expect(lines).toEqual(big.split("\n"));
    const sum = new Summarizer("f");
    for (const l of lines) sum.push(l);
    expect(sum.result()).toEqual(summarize(big, "f"));
    await rm(dir, { recursive: true, force: true });
  });

  test("turns attach tool results to their calls", () => {
    const t = toTurns(TRANSCRIPT);
    expect(t.map((x) => x.role)).toEqual(["user", "assistant"]);
    expect(t[1].blocks[1]).toMatchObject({ kind: "tool", name: "Bash", summary: "ls", result: "a.txt" });
  });

  test("a message sent while Claude works is a user turn, once, and the first entrypoint is kept", () => {
    // Shapes from a Claude Code 2.1 transcript (2026-10-26): the mid-turn message exists only as these lines.
    const lines = [
      { type: "user", entrypoint: "sdk-cli", sessionId: "s", uuid: "u1", timestamp: "2026-10-26T02:37:10Z", message: { role: "user", content: "sleep then reply" } },
      { type: "assistant", entrypoint: "cli", sessionId: "s", uuid: "a1", timestamp: "2026-10-26T02:37:12Z", message: { id: "m1", role: "assistant", model: "m", content: [{ type: "text", text: "working" }] } },
      { type: "queue-operation", operation: "enqueue", timestamp: "2026-10-26T02:37:19Z", sessionId: "s", content: "also say TWO" },
      { type: "attachment", uuid: "q1", sessionId: "s", timestamp: "2026-10-26T02:37:20Z", attachment: { type: "queued_command", prompt: "also say TWO", commandMode: "prompt", timestamp: "2026-10-26T02:37:19Z" } },
      { type: "queue-operation", operation: "remove", timestamp: "2026-10-26T02:37:27Z", sessionId: "s", content: "also say TWO", reason: "absorbed_mid_turn" },
      { type: "assistant", sessionId: "s", uuid: "a2", timestamp: "2026-10-26T02:37:30Z", message: { id: "m2", role: "assistant", model: "m", content: [{ type: "text", text: "DONE TWO" }] } },
    ].map((l) => JSON.stringify(l)).join("\n");
    const t = toTurns(lines);
    expect(t.map((x) => [x.role, x.blocks.map((b: any) => b.text).join("|")])).toEqual([
      ["user", "sleep then reply"],
      ["assistant", "working"],
      ["user", "also say TWO"],
      ["assistant", "DONE TWO"],
    ]);
    expect(summarize(lines, "s").entrypoint).toBe("sdk-cli");
    // The last message you sent is the mid-turn one, not Claude's later reply.
    expect(summarize(lines, "s")).toMatchObject({ lastPromptAt: "2026-10-26T02:37:20Z", lastAt: "2026-10-26T02:37:30Z" });
    expect(summarize(lines.split("\n").slice(0, 2).join("\n"), "s").lastPromptAt).toBe("2026-10-26T02:37:10Z");
  });

  test("the stand-in reply Claude Code writes after a stop isn't shown as Claude's", () => {
    // Shape from a real transcript after a stop (claude-test, 236af84a-....jsonl line 27).
    const synthetic = (text: string) => ({ type: "assistant", uuid: "a" + text.length, timestamp: "2026-10-26T02:53:57Z", message: { id: "x" + text.length, model: "<synthetic>", role: "assistant", content: [{ type: "text", text }] } });
    const lines = [
      { type: "user", uuid: "u1", timestamp: "2026-10-26T02:53:38Z", message: { role: "user", content: "Write a poem" } },
      synthetic("No response requested."),
      { type: "user", uuid: "u2", timestamp: "2026-10-26T02:53:57Z", message: { role: "user", content: "Reply with THIRD" } },
      { type: "assistant", uuid: "a3", timestamp: "2026-10-26T02:54:00Z", message: { id: "m3", model: "m", role: "assistant", content: [{ type: "text", text: "THIRD" }] } },
      synthetic("API Error: overloaded"),
    ].map((l) => JSON.stringify(l)).join("\n");
    expect(toTurns(lines).map((x) => [x.role, x.blocks.map((b: any) => b.text).join("|")])).toEqual([
      ["user", "Write a poem"],
      ["user", "Reply with THIRD"],
      ["assistant", "THIRD|API Error: overloaded"],
    ]);
  });
});

// ---- Board (BACKLOG.md tables as Open / In spec / Done) ----

import { attachSteps, cells, parseBacklogBoard } from "../src/parsers/backlogBoard";
import { addImport, importedPaths, removeImport } from "../src/parsers/imports";

const BOARD_BACKLOG = `# Backlog

Status: \`open\`, \`in spec NNN\`, \`done\`.

## From John

| # | Date | Idea (his words) | Verdict | Reason | Source | Status |
|---|---|---|---|---|---|---|
| 1 | 2026-10-17 | "a board" | build | Job 7. | Transcript | done |
| 2 | 2026-10-18 | "pipes \\| inside" | build instead: a box | Job 8. | Transcript | in spec 003 |
| 3 | 2026-10-18 | "later" | pending | Judge after #2. | Transcript | open |

## Choices

| # | Date | Choice | Verdict | Reason | Source | Status |
|---|---|---|---|---|---|---|
| 4 | 2026-10-19 | Something odd | build | x | y | blocked |
| 5 | 2026-10-19 | Spec two | build | x | y | in spec 004 |
| not a number | | | | | | done |

\`\`\`
| 9 | fenced | | | | | done |
\`\`\`
`;

describe("board", () => {
  test("every numbered row of every table goes in a column by its status", () => {
    const cols = parseBacklogBoard(BOARD_BACKLOG);
    expect(cols.map((c) => [c.name, c.cards.map((x) => x.n)])).toEqual([
      ["Open", [3, 4]],
      ["In spec", [2, 5]],
      ["Done", [1]],
    ]);
    expect(cols[1].cards[0]).toMatchObject({ n: 2, idea: '"pipes | inside"', verdict: "build instead: a box", status: "in spec 003", spec: "003" });
    expect(cols[0].cards[1]).toMatchObject({ idea: "Something odd", status: "blocked", spec: null });
  });

  test("an escaped pipe stays in its cell", () => {
    expect(cells("| 1 | a \\| b | c |")).toEqual(["1", "a | b", "c"]);
    expect(cells("not a row")).toBeNull();
  });

  test("no BACKLOG.md or no tables gives three empty columns", () => {
    expect(parseBacklogBoard("").map((c) => [c.key, c.cards.length])).toEqual([["open", 0], ["spec", 0], ["done", 0]]);
    expect(parseBacklogBoard("# Progress\n\n## Next\n\n- [ ] 1. a card\n").flatMap((c) => c.cards)).toEqual([]);
  });

  test("in-spec cards list their spec's steps from features.json", () => {
    const features = JSON.stringify({
      steps: [
        { id: "003-S1", spec: "specs/003-backlog-board.md", description: "Server", status: "passing" },
        { id: "003-S2", spec: "specs/003-backlog-board.md", description: "Page", status: "failing" },
        { id: "0030-S1", spec: "specs/0030-other.md", description: "Other", status: "passing" },
      ],
    });
    const cols = attachSteps(parseBacklogBoard(BOARD_BACKLOG), features);
    expect(cols[1].cards[0].steps).toEqual([
      { id: "003-S1", description: "Server", passing: true },
      { id: "003-S2", description: "Page", passing: false },
    ]);
    expect(cols[1].cards[1].steps).toEqual([]);
    expect(attachSteps(parseBacklogBoard(BOARD_BACKLOG), "{not json")[1].cards[0].steps).toEqual([]);
  });

  test("reads Control Center's own BACKLOG.md", async () => {
    const own = await Bun.file(join(import.meta.dir, "..", "..", "BACKLOG.md")).text();
    const rows = own.split("\n").filter((l) => /^\| \d+ \|/.test(l)).length;
    const cols = parseBacklogBoard(own);
    expect(cols.reduce((n, c) => n + c.cards.length, 0)).toBe(rows);
    expect(cols[1].cards.length).toBeGreaterThan(0);
  });
});

describe("CLAUDE.md imports", () => {
  const MD = "# Project\n\nSee @README.md for the overview.\n\n```\n@docs/in-code.md\n```\nUse `@docs/span.md` literally.\n";

  test("finds imports outside code", () => {
    expect(importedPaths(MD)).toEqual(["README.md"]);
    expect(importedPaths("@./docs/My\\ File.md\n")).toEqual(["docs/My File.md"]);
  });

  test("add then remove gives back the same bytes", () => {
    const on = addImport(MD, "docs/spec.md");
    expect(on).toBe(MD + "\n@docs/spec.md\n");
    expect(addImport(on, "docs/spec.md")).toBe(on);
    const two = addImport(on, "docs/api.md");
    expect(two).toBe(on + "@docs/api.md\n");
    expect(removeImport(two, "docs/spec.md")).toBe(MD + "\n@docs/api.md\n");
    expect(removeImport(removeImport(two, "docs/api.md"), "docs/spec.md")).toBe(MD);
    const crlf = MD.replace(/\n/g, "\r\n");
    expect(Buffer.from(removeImport(addImport(crlf, "docs/x.md"), "docs/x.md")).equals(Buffer.from(crlf))).toBe(true);
    expect(addImport("", "docs/a.md")).toBe("@docs/a.md\n");
  });

  test("escapes spaces", () => {
    expect(addImport("# P\n", "docs/My File.md")).toBe("# P\n\n@docs/My\\ File.md\n");
  });

  test("an import inside a sentence is pointed out, not reworded", () => {
    expect(() => removeImport(MD, "README.md")).toThrow(/line 3/);
  });
});
