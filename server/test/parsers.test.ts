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

const CHANGELOG = `# What's new

Changes to the app, newest first.

## 15 October 2026

- The lab now starts reliably.
`;

describe("changelog", () => {
  test("adds a new day above the newest", () => {
    const out = addEntry(CHANGELOG, "A new thing.", new Date(2026, 9, 17));
    expect(out).toContain("first.\n\n## 17 October 2026\n\n- A new thing.\n\n## 15 October 2026");
    expect(parseChangelog(out).days[0]).toEqual({ date: "17 October 2026", line: 4, entries: ["A new thing."] });
  });

  test("appends under an existing day", () => {
    const out = addEntry(CHANGELOG, "Second.", new Date(2026, 9, 15));
    expect(out.endsWith("- The lab now starts reliably.\n- Second.\n")).toBe(true);
  });
});

describe("settings", () => {
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

  test("turns attach tool results to their calls", () => {
    const t = toTurns(TRANSCRIPT);
    expect(t.map((x) => x.role)).toEqual(["user", "assistant"]);
    expect(t[1].blocks[1]).toMatchObject({ kind: "tool", name: "Bash", summary: "ls", result: "a.txt" });
  });
});
