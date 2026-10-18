import { describe, expect, test } from "bun:test";
import { removeHook } from "../src/api/content";
import { workflowMeta } from "../src/scan/catalog";

describe("workflow meta", () => {
  test("reads name and description in any quote style", () => {
    expect(workflowMeta("export const meta = {\n  name: 'triage',\n  description: \"Sorts new issues\",\n};\nexport default async () => {};")).toEqual({ name: "triage", description: "Sorts new issues" });
    expect(workflowMeta("export const meta = { description: `Checks links`, name: `links` }")).toEqual({ name: "links", description: "Checks links" });
  });
  test("keeps quotes of another kind inside a value", () => {
    expect(workflowMeta(`export const meta = { name: "say-hi", description: "Says 'hi' to everyone" }`).description).toBe("Says 'hi' to everyone");
  });
  test("returns nothing when there is no meta block or field", () => {
    expect(workflowMeta("export default async () => {}")).toEqual({ name: null, description: null });
    expect(workflowMeta("export const meta = { name: 'only-name' }")).toEqual({ name: "only-name", description: null });
  });
  test("ignores fields outside the meta block", () => {
    expect(workflowMeta("const name = 'x';\nexport const meta = { description: 'd' }\nconst other = { name: 'y' }")).toEqual({ name: null, description: "d" });
  });
});

describe("removing a hook", () => {
  const settings = () => ({
    model: "opus",
    hooks: {
      PostToolUse: [
        { matcher: "Edit", hooks: [{ type: "command", command: "a" }, { type: "command", command: "b" }] },
        { matcher: "Write", hooks: [{ type: "command", command: "c" }] },
      ],
      Stop: [{ hooks: [{ type: "command", command: "d" }] }],
    },
  });
  test("removes one hook and keeps its group", () => {
    const o: any = settings();
    removeHook(o, "PostToolUse", 0, 1);
    expect(o.hooks.PostToolUse[0].hooks).toEqual([{ type: "command", command: "a" }]);
    expect(o.hooks.PostToolUse).toHaveLength(2);
  });
  test("removes the group when its last hook goes", () => {
    const o: any = settings();
    removeHook(o, "PostToolUse", 1, 0);
    expect(o.hooks.PostToolUse.map((g: any) => g.matcher)).toEqual(["Edit"]);
  });
  test("removes the event, then the hooks key, when nothing is left", () => {
    const o: any = settings();
    removeHook(o, "Stop", 0, 0);
    expect(o.hooks.Stop).toBeUndefined();
    removeHook(o, "PostToolUse", 1, 0);
    removeHook(o, "PostToolUse", 0, 0);
    removeHook(o, "PostToolUse", 0, 0);
    expect(o).toEqual({ model: "opus" });
  });
  test("refuses a hook that isn't there any more", () => {
    expect(() => removeHook(settings(), "PostToolUse", 0, 5)).toThrow(/already changed/);
    expect(() => removeHook(settings(), "SessionStart", 0, 0)).toThrow(/already changed/);
    expect(() => removeHook({}, "Stop", 0, 0)).toThrow(/already changed/);
  });
});
