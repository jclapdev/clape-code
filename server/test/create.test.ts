import { describe, expect, test } from "bun:test";
import { newItemFile } from "../src/api/content";
import { cleanDoc } from "../src/api/guides";
import { parseFrontmatter } from "../src/parsers/frontmatter";

describe("creating items", () => {
  test("a skill follows the agentskills.io frontmatter", () => {
    const t = newItemFile({ kind: "skill", name: "review-pr", description: 'Reviews a pull request. Use when asked "review this".', body: "# Review\n\nRead the diff." });
    const fm = parseFrontmatter(t);
    expect(fm.error).toBeNull();
    expect(fm.data).toEqual({ name: "review-pr", description: 'Reviews a pull request. Use when asked "review this".' });
    expect(fm.body.trim()).toBe("# Review\n\nRead the diff.");
  });
  test("a command is a skill that only runs when typed", () => {
    expect(parseFrontmatter(newItemFile({ kind: "command", name: "ship", description: "Ships it." })).data["disable-model-invocation"]).toBe(true);
  });
  test("bad names are refused in plain words", () => {
    for (const name of ["Review", "-x", "a--b", "a b", "x".repeat(65)]) expect(() => newItemFile({ kind: "skill", name, description: "d" })).toThrow(/lowercase letters/);
  });
  test("an agent lists its tools and model", () => {
    const fm = parseFrontmatter(newItemFile({ kind: "agent", name: "reviewer", description: "Reviews code. Use proactively.", tools: ["Read", "Grep", "rm -rf"], model: "haiku", body: "You review code." }));
    expect(fm.data).toEqual({ name: "reviewer", description: "Reviews code. Use proactively.", tools: "Read, Grep", model: "haiku" });
  });
  test("a rule scoped to paths", () => {
    const fm = parseFrontmatter(newItemFile({ kind: "rule", name: "api", paths: ["src/api/**/*.ts"], body: "Validate input." }));
    expect(fm.data.paths).toEqual(["src/api/**/*.ts"]);
  });
  test("an output style can keep coding instructions", () => {
    expect(parseFrontmatter(newItemFile({ kind: "output-style", name: "terse", keepCoding: true, body: "Be brief." })).data["keep-coding-instructions"]).toBe(true);
  });
});

describe("guides", () => {
  test("site components are removed and their text kept", () => {
    const md = '> ## Documentation Index\n> Fetch the complete documentation index at: x\n\n# Title\n\nexport const X = () => {\n  return 1;\n};\n\n<Tip>\n  Keep it short.\n</Tip>\n\n<Step title="Plan">\n\n```bash theme={null}\nls\n```\n\n<h3 id="a">\n  Heading\n</h3>';
    const out = cleanDoc(md);
    expect(out).not.toContain("export const");
    expect(out).not.toContain("<Tip>");
    expect(out).not.toContain("Documentation Index");
    expect(out).toContain("Keep it short.");
    expect(out).toContain("#### Plan");
    expect(out).toContain("```bash\nls\n```");
  });
});

describe("adding to settings", () => {
  test("a permission rule is added once and other keys stay", async () => {
    const { addToSettings } = await import("../src/api/content");
    const o: Record<string, any> = { model: "opus", permissions: { allow: ["Read"], deny: ["Bash(rm *)"] } };
    addToSettings(o, { what: "permission", list: "allow", rule: "Bash(npm test)" });
    addToSettings(o, { what: "permission", list: "allow", rule: "Bash(npm test)" });
    expect(o).toEqual({ model: "opus", permissions: { allow: ["Read", "Bash(npm test)"], deny: ["Bash(rm *)"] } });
  });
  test("a hook is added under its event with a matcher only for tool events", async () => {
    const { addToSettings } = await import("../src/api/content");
    const o: Record<string, any> = { hooks: { Stop: [{ hooks: [{ type: "command", command: "a" }] }] } };
    addToSettings(o, { what: "hook", event: "PostToolUse", matcher: "Edit|Write", command: "prettier --write" });
    addToSettings(o, { what: "hook", event: "Stop", matcher: "ignored", command: "b" });
    expect(o.hooks.PostToolUse).toEqual([{ matcher: "Edit|Write", hooks: [{ type: "command", command: "prettier --write" }] }]);
    expect(o.hooks.Stop[1]).toEqual({ hooks: [{ type: "command", command: "b" }] });
  });
});

describe("home", () => {
  test("a usage-limit pause from yesterday doesn't count as needing you", async () => {
    const { isStaleLimit } = await import("../src/api/sessions");
    const now = Date.parse("2026-10-18T12:00:00Z");
    expect(isStaleLimit({ detail: "You've hit your session limit · resets 1:30pm", updatedAt: "2026-10-12T10:00:00Z" }, now)).toBe(true);
    expect(isStaleLimit({ detail: "You've hit your session limit · resets 1:30pm", updatedAt: "2026-10-18T11:00:00Z" }, now)).toBe(false);
    expect(isStaleLimit({ detail: "Waiting for approval to run npm test", updatedAt: "2026-10-12T10:00:00Z" }, now)).toBe(false);
  });
});
