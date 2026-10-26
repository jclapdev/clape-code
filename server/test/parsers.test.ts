import { describe, expect, test } from "bun:test";
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
  });
});

// ---- Board (PROGRESS.md as Next / In progress / Done) ----

import { addCard, deleteCard, editCard, moveCard, NEW_BOARD, parseBoard } from "../src/parsers/board";
import { addImport, importedPaths, removeImport } from "../src/parsers/imports";

const PROGRESS = `# Progress

Read this first.

## Done

- [x] 1. Menu cut down (2026-10-18).
- [x] 2. One page per project.

## Waiting for John

- **Choices:**
  1. Something he should check.
- [ ] Not a card: this section isn't a column.

## In progress

- [x] 3. Shell and menu.
- [ ] 4. **Next: Projects**: board and context.
  - a sub-point that belongs to the card
- [ ] 5. Settings page.

Facts checked on 2026-10-18: a paragraph that stays put.

## Next

- [ ] Share rules between projects. #research
- [ ] Check every page at 390 px. #ui #check

## Notes

- Run the dev server as two processes.
`;

/** The lines of b that aren't in a, and the lines of a that aren't in b, as multisets. */
function diffLines(a: string, b: string) {
  const count = (s: string) => s.split("\n").reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map<string, number>());
  const ca = count(a);
  const cb = count(b);
  const added: string[] = [];
  const removed: string[] = [];
  for (const [l, n] of cb) for (let i = 0; i < n - (ca.get(l) ?? 0); i++) added.push(l);
  for (const [l, n] of ca) for (let i = 0; i < n - (cb.get(l) ?? 0); i++) removed.push(l);
  return { added, removed };
}

const lineOf = (src: string, start: string) => src.split("\n").findIndex((l) => l.startsWith(start));

describe("board", () => {
  test("reads only Next, In progress and Done", () => {
    const cols = parseBoard(PROGRESS);
    expect(cols.map((c) => [c.key, c.cards.length])).toEqual([
      ["next", 2],
      ["progress", 3],
      ["done", 2],
    ]);
    const four = cols[1].cards[1];
    expect(four.end - four.line).toBe(1); // the indented sub-point is part of the card
    expect(four.n).toBe(4);
    expect(cols[0].cards[1]).toMatchObject({ title: "Check every page at 390 px.", labels: ["ui", "check"], done: false });
  });

  test("a label must start with a letter and end the line", () => {
    const [next] = parseBoard("## Next\n\n- Fix bug #123\n- #wip in the middle text\n");
    expect(next.cards.map((c) => c.labels)).toEqual([[], []]);
  });

  test("a new board has three empty columns", () => {
    expect(parseBoard(NEW_BOARD).map((c) => [c.name, c.line, c.cards.length])).toEqual([
      ["Next", 2, 0],
      ["In progress", 4, 0],
      ["Done", 6, 0],
    ]);
  });

  test("edit changes only that line and keeps checkbox and number", () => {
    const at = lineOf(PROGRESS, "- [ ] 5.");
    const out = editCard(PROGRESS, at, "Settings page, first part");
    expect(out.split("\n")[at]).toBe("- [ ] 5. Settings page, first part");
    expect(diffLines(PROGRESS, out)).toEqual({ added: ["- [ ] 5. Settings page, first part"], removed: ["- [ ] 5. Settings page."] });
  });

  test("delete removes the card and its indented lines only", () => {
    const out = deleteCard(PROGRESS, lineOf(PROGRESS, "- [ ] 4."));
    expect(diffLines(PROGRESS, out)).toEqual({ added: [], removed: ["- [ ] 4. **Next: Projects**: board and context.", "  - a sub-point that belongs to the card"] });
  });

  test("lines outside the columns can't be edited as cards", () => {
    expect(() => deleteCard(PROGRESS, lineOf(PROGRESS, "- [ ] Not a card"))).toThrow();
  });

  test("add matches the column's style and continues the numbers", () => {
    const next = addCard(PROGRESS, "next", "Write docs #docs");
    expect(diffLines(PROGRESS, next)).toEqual({ added: ["- [ ] Write docs #docs"], removed: [] });
    expect(next.split("\n")[lineOf(PROGRESS, "- [ ] Check every page") + 1]).toBe("- [ ] Write docs #docs");
    const prog = addCard(PROGRESS, "progress", "Board");
    expect(prog.split("\n")[lineOf(PROGRESS, "- [ ] 5.") + 1]).toBe("- [ ] 6. Board");
    const done = addCard(PROGRESS, "done", "Shipped");
    expect(done.split("\n")[lineOf(PROGRESS, "- [x] 2.") + 1]).toBe("- [x] 6. Shipped");
  });

  test("a card moves across all three columns, touching only its own lines", () => {
    let text = addCard(PROGRESS, "next", "Try the board #test");
    const added = text;
    text = moveCard(text, lineOf(text, "- [ ] Try the board"), "progress");
    expect(parseBoard(text)[1].cards.at(-1)!.title).toBe("Try the board");
    text = moveCard(text, lineOf(text, "- [ ] Try the board"), "done");
    expect(parseBoard(text)[2].cards.at(-1)).toMatchObject({ title: "Try the board", done: true });
    expect(diffLines(added, text)).toEqual({ added: ["- [x] Try the board #test"], removed: ["- [ ] Try the board #test"] });
    text = moveCard(text, lineOf(text, "- [x] Try the board"), "next");
    expect(parseBoard(text)[0].cards.at(-1)).toMatchObject({ title: "Try the board", done: false });
    expect(text).toBe(added);
    expect(deleteCard(text, lineOf(text, "- [ ] Try the board"))).toBe(PROGRESS);
  });

  test("moving a card carries its indented lines", () => {
    const out = moveCard(PROGRESS, lineOf(PROGRESS, "- [ ] 4."), "next");
    const lines = out.split("\n");
    const at = lineOf(out, "- [ ] 4.");
    expect(lines[at - 1]).toBe("- [ ] Check every page at 390 px. #ui #check");
    expect(lines[at + 1]).toBe("  - a sub-point that belongs to the card");
    expect(diffLines(PROGRESS, out)).toEqual({ added: [], removed: [] });
  });

  test("Windows line endings stay, byte for byte", () => {
    const crlf = PROGRESS.replace(/\n/g, "\r\n");
    let text = addCard(crlf, "next", "CRLF card");
    expect(text).toContain("\r\n- [ ] CRLF card\r\n");
    text = moveCard(text, lineOf(text, "- [ ] CRLF card"), "progress");
    text = moveCard(text, lineOf(text, "- [ ] CRLF card"), "done");
    expect(text.replace(/\r\n/g, "")).not.toContain("\n");
    text = deleteCard(text, lineOf(text, "- [x] CRLF card"));
    expect(Buffer.from(text).equals(Buffer.from(crlf))).toBe(true);
  });

  test("a file mixing line endings keeps each line's own ending", () => {
    const mixed = "# P\r\n\r\n## Next\n\n- [ ] a\r\n- [ ] b\n\n## Done\r\n\r\n- [x] c\r\n";
    const out = moveCard(mixed, 4, "done");
    expect(out).toBe("# P\r\n\r\n## Next\n\n- [ ] b\n\n## Done\r\n\r\n- [x] c\r\n- [x] a\r\n");
    expect(moveCard(out, lineOf(out, "- [x] a"), "next")).toBe("# P\r\n\r\n## Next\n\n- [ ] b\n- [ ] a\r\n\n## Done\r\n\r\n- [x] c\r\n");
  });

  test("first card in an empty column goes under its heading", () => {
    expect(addCard(NEW_BOARD, "progress", "Start")).toBe("# Progress\n\n## Next\n\n## In progress\n\n- [ ] Start\n\n## Done\n");
    expect(addCard(NEW_BOARD, "done", "Old")).toBe("# Progress\n\n## Next\n\n## In progress\n\n## Done\n\n- [x] Old\n");
    // Moving through every empty column and deleting it gives back the empty board.
    let t = addCard(NEW_BOARD, "next", "Walk");
    t = moveCard(t, lineOf(t, "- [ ] Walk"), "progress");
    expect(t).toBe("# Progress\n\n## Next\n\n## In progress\n\n- [ ] Walk\n\n## Done\n");
    t = moveCard(t, lineOf(t, "- [ ] Walk"), "done");
    expect(t).toBe("# Progress\n\n## Next\n\n## In progress\n\n## Done\n\n- [x] Walk\n");
    expect(deleteCard(t, lineOf(t, "- [x] Walk"))).toBe(NEW_BOARD);
  });

  test("a missing column is added at the end of the file", () => {
    const src = "# Progress\n\n## Done\n\n- [x] a\n\n## Notes\n\nkeep me\n";
    expect(addCard(src, "next", "b")).toBe(src + "\n## Next\n\n- [ ] b\n");
  });

  test("a file without a final newline", () => {
    const src = "## Next\n\n- [ ] a\n\n## Done\n\n- [x] b";
    const out = moveCard(src, 2, "done");
    expect(out).toBe("## Next\n\n## Done\n\n- [x] b\n- [x] a");
    expect(deleteCard(out, lineOf(out, "- [x] a"))).toBe("## Next\n\n## Done\n\n- [x] b");
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
