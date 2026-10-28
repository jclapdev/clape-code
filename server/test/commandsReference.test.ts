// Claude Code's own commands: the parser, the copy shipped with the app (scripts/commands-reference.ts), and the
// merge with what the last session reported.
import { describe, expect, test } from "bun:test";
import { parseCommandsReference, type CommandsReference } from "../src/parsers/commandsReference";
import { mergeCommands } from "../src/scan/commandsReference";
import shipped from "../src/data/commands-reference.json";

const ref = shipped as CommandsReference;
const by = (n: string) => ref.commands.find((c) => c.name === n);

describe("the shipped command list", () => {
  test("about 120 commands, each named once with a purpose", () => {
    // 120 rows on 27 Oct (grep -c '^| `/'), less a second /design row and three marked "Removed".
    expect(ref.commands.length).toBeGreaterThan(110);
    expect(ref.commands.length).toBeLessThan(130);
    expect(new Set(ref.commands.map((c) => c.name)).size).toBe(ref.commands.length);
    for (const c of ref.commands) {
      expect(c.name).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(c.description).toBeTruthy();
      expect(c.description).not.toMatch(/\]\(|\*\*|`/);
    }
    expect(by("vim")).toBeUndefined();
  });

  test("the name, its hint and the first sentence of its purpose", () => {
    expect(by("add-dir")).toMatchObject({ argumentHint: "<path>", skill: false, description: "Add a working directory for file access during the current session." });
    expect(by("advisor")?.argumentHint).toBe("[model|off]");
    expect(by("init")?.argumentHint).toBe("");
    expect(by("deep-research")?.description.startsWith("Fan out web searches")).toBe(true);
  });

  test("bundled skills are marked", () => {
    expect(by("fewer-permission-prompts")?.skill).toBe(true);
    expect(by("compact")?.skill).toBe(false);
    // 20 rows start "**[Skill](...)**" on 27 Oct.
    expect(ref.commands.filter((c) => c.skill).length).toBe(20);
  });
});

describe("parsing the page", () => {
  const md = [
    "## Something else",
    "| `/not-this` | Outside the table. |",
    "## All commands",
    "| Command | Purpose |",
    "| :- | :- |",
    "| `/one [a\\|b]` | First [link](https://x.y/z). Second. |",
    "| `/two` | **[Skill](https://x.y).** Does `two` things. More |",
    "| `/three sub1`, `/three sub2` | Sub commands |",
    "## See also",
    "| `/four` | After the table. |",
  ].join("\n");
  const r = parseCommandsReference(md, "2026-10-27T00:00:00.000Z");
  test("only the All commands table", () => expect(r.commands.map((c) => c.name)).toEqual(["one", "two", "three"]));
  test("escaped pipes, links, skills and several forms", () => {
    expect(r.commands[0]).toEqual({ name: "one", argumentHint: "[a|b]", description: "First link.", skill: false });
    expect(r.commands[1]).toEqual({ name: "two", argumentHint: "", description: "Does two things.", skill: true });
    expect(r.commands[2].argumentHint).toBe("sub1 | sub2");
  });
});

describe("merging with the last session's list", () => {
  const docs = [
    { name: "compact", description: "Free up context.", argumentHint: "[instructions]", skill: false },
    { name: "simplify", description: "Review.", argumentHint: "", skill: true },
  ];
  const merged = mergeCommands(docs, [
    { name: "compact", description: "From the session", argumentHint: "" },
    { name: "brand-new", description: "Newer than the docs", argumentHint: "<x>" },
    { name: "__internal", description: "", argumentHint: "" },
    { name: "mcp__github__review", description: "Review a PR", argumentHint: "" },
    { name: "linear:triage (MCP)", description: "Triage", argumentHint: "" },
    { name: "sentry:issues", description: "List issues (MCP)", argumentHint: "" },
    { name: "myplugin:skill", description: "A plugin skill", argumentHint: "" },
  ]);
  const get = (n: string) => merged.find((c) => c.name === n);
  test("the docs' purpose wins and commands the docs don't list are kept", () => {
    expect(get("compact")).toEqual({ name: "compact", description: "Free up context.", argumentHint: "[instructions]", tag: "Built into Claude Code" });
    expect(get("simplify")?.tag).toBe("Built-in skill");
    expect(get("brand-new")).toEqual({ name: "brand-new", description: "Newer than the docs", argumentHint: "<x>", tag: "Built into Claude Code" });
  });
  test("__ names stay hidden", () => expect(get("__internal")).toBeUndefined());
  test("MCP prompts in either form are tagged with their server", () => {
    expect(get("mcp__github__review")?.tag).toBe("From MCP server github");
    expect(get("linear:triage")?.tag).toBe("From MCP server linear");
    expect(get("sentry:issues")?.tag).toBe("From MCP server sentry");
    expect(get("myplugin:skill")?.tag).toBe("Built into Claude Code");
  });
});
