// Parsers against files copied from a real ~/.claude and a real project, with their content scrubbed
// (see fixtures/). Expected numbers were counted independently from the fixture files.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addItem, parseBacklog, toggleItem } from "../src/parsers/backlog";
import { addEntry, parseChangelog } from "../src/parsers/changelog";
import { effective } from "../src/parsers/settings";
import { summarize, toTurns } from "../src/parsers/transcript";

const fx = (name: string) => readFileSync(join(import.meta.dir, "fixtures", name), "utf8");

describe("real transcript", () => {
  const s = summarize(fx("transcript.jsonl"), "x");
  test("summary", () => {
    expect(s.title).toBe("Approval UI test");
    expect(s.model).toBe("claude-haiku-5-5");
    expect(s.assistantMessages).toBe(4);
    expect(s.toolCalls).toBe(2);
    expect(s.usage).toEqual({ input: 8, output: 268, cacheRead: 61666, cacheWrite: 22257 });
    expect(s.costUSD).toBeCloseTo(0.00503265, 8);
    expect(s.cwd).toBe("/Users/user/.claude/jobs/171ade96/tmp/projects/livetest");
    expect(s.prompts).toBeGreaterThan(0);
  });
  test("turns pair the question and the Bash call with their results", () => {
    const tools = toTurns(fx("transcript.jsonl")).flatMap((t) => t.blocks.filter((b) => b.kind === "tool"));
    expect(tools.map((t: any) => t.name)).toEqual(["AskUserQuestion", "Bash"]);
    expect(tools.every((t: any) => t.result !== undefined)).toBe(true);
  });
});

describe("real BACKLOG.md format", () => {
  const text = fx("BACKLOG.md");
  test("sections and numbering", () => {
    const b = parseBacklog(text);
    expect(b.title).toBe("Backlog");
    expect(b.numbered && b.checkboxes).toBe(true);
    expect(b.sections[0].name).toBe("Structure");
    const ns = b.sections.flatMap((s) => s.items.map((i) => i.n));
    expect(ns).toEqual([...ns].sort((a, b) => a! - b!));
  });
  test("toggle twice restores every byte; add continues the numbering", () => {
    const first = parseBacklog(text).sections[0].items[0];
    expect(toggleItem(toggleItem(text, first.line), first.line)).toBe(text);
    const last = parseBacklog(text).sections.at(-1)!;
    const max = Math.max(...parseBacklog(text).sections.flatMap((s) => s.items.map((i) => i.n ?? 0)));
    expect(addItem(text, last.line, "New")).toContain(`- [ ] ${max + 1}. New`);
  });
});

describe("real CHANGELOG.md format", () => {
  test("adds today's section above the newest", () => {
    const out = addEntry(fx("CHANGELOG.md"), "Something changed.", new Date(2026, 9, 18));
    const days = parseChangelog(out).days;
    expect(days[0]).toMatchObject({ date: "18 October 2026", entries: ["Something changed."] });
    expect(days[1].date).toBe("15 October 2026");
  });
});

describe("real settings.json", () => {
  test("every key comes from the user file and hooks keep their events", () => {
    const user = JSON.parse(fx("settings.json"));
    const eff = effective({ user });
    expect(eff.every((e) => e.from === "user")).toBe(true);
    expect(Object.keys(eff.find((e) => e.key === "hooks")!.value as object)).toEqual(Object.keys(user.hooks));
  });
});
