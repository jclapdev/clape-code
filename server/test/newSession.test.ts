// The New session page (/sessions/new) and the buttons that open it.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { firstPage, keepDraft, newSessionSearch, pickProject } from "../../web/src/lib/newSession";

const WEB = join(import.meta.dir, "..", "..", "web", "src");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });

describe("New session page", () => {
  test("a link that fills in the prompt keeps the draft you had typed (BACKLOG #117)", () => {
    expect(keepDraft("fix the login bug", null, "/init")).toBe("fix the login bug");
    // Nothing to keep: no link, an empty box, or the box already holds the linked prompt.
    expect(keepDraft("fix the login bug", null, undefined)).toBe(null);
    expect(keepDraft("  ", "older", "/init")).toBe("older");
    expect(keepDraft("/init", null, "/init")).toBe(null);
    // A second link doesn't push out the draft kept the first time; opening the same link twice keeps it once.
    expect(keepDraft("draft two", "draft one", "/init")).toBe("draft one\n\ndraft two");
    expect(keepDraft("draft one", "draft one", "/init")).toBe("draft one");
  });

  test("the address fills in the project, first message and a known permission mode only", () => {
    expect(newSessionSearch({ project: "~/projects/demo", prompt: "/init", mode: "plan" })).toEqual({ project: "~/projects/demo", prompt: "/init", mode: "plan" });
    expect(newSessionSearch({ mode: "bypassPermissions", project: "", new: "1" })).toEqual({ project: undefined, prompt: undefined, mode: undefined });
  });

  test("the project asked for is kept; otherwise the one with the latest session that has files", () => {
    const ps = [
      { id: "a", empty: false, lastSessionAt: "2026-10-20T00:00:00Z" },
      { id: "b", empty: false, lastSessionAt: "2026-10-24T00:00:00Z" },
      { id: "c", empty: true, lastSessionAt: "2026-10-25T00:00:00Z" },
    ];
    expect(pickProject(ps, "a")).toBe("a");
    expect(pickProject(ps)).toBe("b");
    expect(pickProject([])).toBe("");
  });

  test("the conversation page opens with the first message already in it", () => {
    const p = firstPage({ sessionId: "s1", liveId: "l1", project: "~/projects/demo", prompt: "  fix the build\nthen test  ", model: "opus", permissionMode: "acceptEdits", at: "2026-10-25T10:00:00Z" });
    expect(p).toMatchObject({ sessionId: "s1", displayTitle: "fix the build", status: "starting", totalTurns: 1, model: "opus", permissionMode: "acceptEdits", pending: [] });
    expect(p.turns[0]!.blocks[0]!.text).toBe("fix the build\nthen test");
  });

  test("every New session button opens /sessions/new; nothing links to the old /live form", () => {
    const old: string[] = [];
    let buttons = 0;
    for (const f of files(WEB)) {
      const src = readFileSync(f, "utf8");
      if (/to[=:] ?"\/live"/.test(src) && !f.endsWith("router.tsx")) old.push(relative(WEB, f));
      for (const m of src.matchAll(/<Link to="([^"]+)"[^>]*>\s*(?:<Plus aria-hidden \/>)?\s*New session\s*</g)) {
        buttons++;
        expect(m[1]).toBe("/sessions/new");
      }
    }
    expect(old).toEqual([]);
    expect(buttons).toBe(3); // Home, Sessions and a project page
  });
});
