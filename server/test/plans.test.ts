import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planVerdictOf, summarize } from "../src/parsers/transcript";
import { linkPlan, plansDirOf } from "../src/scan/plans";

const line = (o: object) => JSON.stringify({ sessionId: "s1", cwd: "/p/a", slug: "brave-plan", ...o });
const exitPlan = (id: string, at: string) => line({ type: "assistant", timestamp: at, message: { id: `m-${id}`, model: "x", content: [{ type: "tool_use", id, name: "ExitPlanMode", input: { planFilePath: "/h/.claude/plans/brave-plan.md" } }] } });
const answer = (id: string, at: string, content: string, is_error = false) => line({ type: "user", timestamp: at, message: { content: [{ type: "tool_result", tool_use_id: id, content, is_error }] } });

describe("plan verdicts", () => {
  test("reads the three kinds of ExitPlanMode answer", () => {
    expect(planVerdictOf("User has approved your plan. You can now start coding.")).toBe("approved");
    expect(planVerdictOf("The user doesn't want to proceed with this tool use.")).toBe("not-approved");
    expect(planVerdictOf("PreToolUse:ExitPlanMode hook error: Agent hook condition was not met")).toBe("not-approved");
    expect(planVerdictOf("Something else")).toBeNull();
  });

  test("the summary keeps the slug and the last answer, ignoring other tools' results", () => {
    const text = [
      exitPlan("t1", "2026-10-01T00:00:00Z"),
      answer("t1", "2026-10-01T00:01:00Z", "The user doesn't want to proceed with this tool use.", true),
      answer("other", "2026-10-01T00:02:00Z", "User has approved your plan."),
      exitPlan("t2", "2026-10-01T00:03:00Z"),
      answer("t2", "2026-10-01T00:04:00Z", "User has approved your plan. You can now start coding."),
    ].join("\n");
    const s = summarize(text, "s1");
    expect(s.slugs).toEqual(["brave-plan"]);
    expect(s.cwds).toEqual({ "/p/a": 5 });
    expect(s.planVerdict).toEqual({ status: "approved", at: "2026-10-01T00:04:00Z" });
    expect(s.plans).toEqual(["/h/.claude/plans/brave-plan.md"]);
  });

  test("a session that never asked has no verdict", () => {
    expect(summarize(line({ type: "user", message: { content: "hi" } }), "s1").planVerdict).toBeNull();
  });
});

describe("linking plans", () => {
  const projects = [
    { id: "~/projects/a", name: "a", dir: "/home/projects/a" },
    { id: "~/projects/b", name: "b", dir: "/home/projects/b" },
  ];
  const s = (sessionId: string, cwd: string | null, lastAt: string, extra: object = {}) => ({ sessionId, cwd, title: null, firstPrompt: `prompt ${sessionId}`, lastAt, plans: [], slugs: [], planVerdict: null, ...extra });
  const path = "/home/.claude/plans/brave-plan.md";

  test("matches by slug or by plan file path, newest first, ignoring others", () => {
    const l = linkPlan(path, [s("1", "/home/projects/a", "2026-10-01", { slugs: ["brave-plan"] }), s("2", "/home/projects/a", "2026-10-03", { plans: [path] }), s("3", "/home/projects/a", "2026-10-05", { slugs: ["other"] })], projects);
    expect(l.conversations.map((c) => c.sessionId)).toEqual(["2", "1"]);
    expect(l.conversations[0]).toEqual({ sessionId: "2", title: "prompt 2", at: "2026-10-03" });
    expect(l.project).toEqual({ id: "~/projects/a", name: "a" });
    expect(l.status).toBe("draft");
  });

  test("the project with most conversations wins; worktrees count for their project; folders in no project don't", () => {
    const l = linkPlan(path, [s("1", "/home/projects/a", "2026-10-09", { slugs: ["brave-plan"] }), s("2", "/home/projects/b/.claude/worktrees/x", "2026-10-02", { slugs: ["brave-plan"] }), s("3", "/home/projects/b", "2026-10-03", { slugs: ["brave-plan"] }), s("4", "/home/projects", "2026-10-04", { slugs: ["brave-plan"] }), s("5", "/home/projects", "2026-10-05", { slugs: ["brave-plan"] })], projects);
    expect(l.project?.name).toBe("b");
  });

  test("a tie goes to the project with the newest conversation", () => {
    const l = linkPlan(path, [s("1", "/home/projects/a", "2026-10-01", { slugs: ["brave-plan"] }), s("2", "/home/projects/b", "2026-10-02", { slugs: ["brave-plan"] })], projects);
    expect(l.project?.name).toBe("b");
  });

  test("a conversation that moved counts for each project it ran in; a full tie goes to where more lines ran", () => {
    const moved = s("1", "/home/projects", "2026-10-01", { slugs: ["brave-plan"], cwds: { "/home/projects": 50, "/home/projects/a": 5, "/home/projects/b/.claude/worktrees/x": 30, "/home/projects/b/web": 10 } });
    expect(linkPlan(path, [moved], projects).project?.name).toBe("b");
    const other = s("2", "/home/projects/a", "2026-09-01", { slugs: ["brave-plan"], cwds: { "/home/projects/a": 1 } });
    expect(linkPlan(path, [moved, other], projects).project?.name).toBe("a");
  });

  test("no conversation in a project leaves it for all projects", () => {
    expect(linkPlan(path, [s("1", "/home/projects", "2026-10-01", { slugs: ["brave-plan"] })], projects).project).toBeNull();
    expect(linkPlan(path, [], projects)).toEqual({ status: "draft", project: null, conversations: [] });
  });

  test("status is the latest answer across its conversations", () => {
    const l = linkPlan(path, [s("1", null, "2026-10-09", { slugs: ["brave-plan"], planVerdict: { status: "approved", at: "2026-10-01" } }), s("2", null, "2026-10-02", { slugs: ["brave-plan"], planVerdict: { status: "not-approved", at: "2026-10-02" } })], projects);
    expect(l.status).toBe("not-approved");
  });
});

describe("a project's plans folder", () => {
  let root: string;
  const saved = process.env.CC_CLAUDE_DIR;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "cc-plans-"));
    process.env.CC_CLAUDE_DIR = join(root, ".claude");
    await mkdir(join(root, ".claude"), { recursive: true });
  });
  afterAll(async () => {
    if (saved === undefined) delete process.env.CC_CLAUDE_DIR;
    else process.env.CC_CLAUDE_DIR = saved;
    await rm(root, { recursive: true, force: true });
  });

  test("reads plansDirectory relative to the project, local settings first, and refuses folders outside it", async () => {
    const p = join(root, "proj");
    await mkdir(join(p, ".claude"), { recursive: true });
    expect(await plansDirOf(p)).toBeNull();
    await writeFile(join(root, ".claude", "settings.json"), JSON.stringify({ plansDirectory: "./docs/plans" }));
    expect(await plansDirOf(p)).toBe(join(p, "docs", "plans"));
    await writeFile(join(p, ".claude", "settings.json"), JSON.stringify({ plansDirectory: "plans" }));
    expect(await plansDirOf(p)).toBe(join(p, "plans"));
    await writeFile(join(p, ".claude", "settings.local.json"), JSON.stringify({ plansDirectory: "../elsewhere" }));
    expect(await plansDirOf(p)).toBeNull();
  });
});
