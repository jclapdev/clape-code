// Plugin requests from the browser and what `claude plugin …` prints, in the formats the plugin command
// reference documents. Nothing here runs Claude Code.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initArgs, initResult, marketplaceCounts, parseAvailable, parseMarketplaces, pluginArgs, pluginResult, searchAvailable, skillsDirPlugins } from "../src/scan/plugins";

const run = (out: string, code = 0, err = "") => ({ code, out, err });

describe("plugin requests", () => {
  test("builds the command for each action", () => {
    expect(pluginArgs("install", "formatter@my-marketplace")).toEqual(["plugin", "install", "formatter@my-marketplace", "--json"]);
    expect(pluginArgs("disable", "cc-test-plugin@skills-dir")).toEqual(["plugin", "disable", "cc-test-plugin@skills-dir", "--json"]);
    expect(pluginArgs("uninstall", "a.b_c@claude-plugins-official")).toEqual(["plugin", "uninstall", "a.b_c@claude-plugins-official", "--json"]);
  });
  test("refuses unknown actions", () => {
    expect(() => pluginArgs("update", "x@y")).toThrow(/Unknown plugin action/);
    expect(() => pluginArgs("marketplace", "x@y")).toThrow(/Unknown plugin action/);
  });
  test("refuses anything that could be read as a flag or isn't name@marketplace", () => {
    for (const id of ["--all", "-a", "x@-y", "-x@y", "formatter", "", "a@b@c", "a b@c", "a@b;rm", "../x@y", undefined, null, 5])
      expect(() => pluginArgs("disable", id)).toThrow(/isn't a plugin id/);
    expect(() => pluginArgs("enable", `${"a".repeat(200)}@b`)).toThrow();
  });
  test("refuses installing a plugin from your skills folder", () => {
    expect(() => pluginArgs("install", "mine@skills-dir")).toThrow(/load without installing/);
  });
});

describe("plugin command results", () => {
  test("reads the JSON result on the last line, after anything printed before it", () => {
    const out = `Running marketplace command…\n{"command":"install","outcome":"ok","pluginId":"formatter@m","scope":"user","message":"Successfully installed plugin: formatter@m (scope: user)"}\n`;
    expect(pluginResult("install", run(out))).toEqual({ message: "Successfully installed plugin: formatter@m (scope: user)", already: false });
  });
  test("treats asking for the state a plugin is already in as done", () => {
    const out = `{"command":"enable","outcome":"failed","failureCode":"already_in_goal_state","alreadyInGoalState":true,"message":"Plugin \\"formatter\\" is already enabled"}`;
    expect(pluginResult("enable", run(out, 1))).toEqual({ message: 'Plugin "formatter" is already enabled', already: true });
  });
  test("throws a failure in Claude Code's own words", () => {
    const out = `{"command":"uninstall","outcome":"failed","failureCode":"settings_still_on","message":"Failed to uninstall plugin \\"formatter@m\\": \\"formatter\\" was not uninstalled: .claude/settings.json still enables it"}`;
    expect(() => pluginResult("uninstall", run(out, 1))).toThrow('Failed to uninstall plugin "formatter@m": "formatter" was not uninstalled: .claude/settings.json still enables it');
  });
  test("a failed outcome is an error even with exit code 0", () => {
    expect(() => pluginResult("install", run(`{"command":"install","outcome":"failed","message":"Plugin not found in marketplace"}`, 0))).toThrow("Plugin not found in marketplace");
  });
  test("a usage error has no result line; the reason comes from stderr", () => {
    expect(() => pluginResult("disable", run("", 1, "error: option '-s, --scope <scope>' argument 'nope' is invalid\n"))).toThrow("error: option '-s, --scope <scope>' argument 'nope' is invalid");
  });
  test("a failure with no words at all still says what failed", () => {
    expect(() => pluginResult("enable", run("", 1, ""))).toThrow("Claude Code couldn't enable the plugin.");
  });
  test("a failure is a 400 for the browser", () => {
    let status = 0;
    try {
      pluginResult("disable", run('{"outcome":"failed","message":"nope"}', 1));
    } catch (e: any) {
      status = e.status;
    }
    expect(status).toBe(400);
  });
});

describe("marketplace plugins", () => {
  const stdout = `${JSON.stringify(
    {
      installed: [{ id: "a@m1", version: "1.0.0", scope: "user", enabled: true, installPath: "/x" }],
      available: [
        { pluginId: "formatter@m1", name: "formatter", marketplaceName: "m1", source: "./plugins/formatter", description: "Formats code on save", installCount: 50 },
        { pluginId: "linter@m1", name: "linter", marketplaceName: "m1", source: { source: "github", repo: "o/r" }, description: "Lints and formats", installCount: 900 },
        { pluginId: "deploy@m2", name: "deploy", marketplaceName: "m2", source: "./deploy", version: "2.0.0" },
        { name: "broken" },
      ],
    },
    null,
    2,
  )}\n`;
  const list = parseAvailable(stdout);

  test("reads the available list and leaves out sources and malformed entries", () => {
    expect(list).toHaveLength(3);
    expect(list[0]).toEqual({ pluginId: "formatter@m1", name: "formatter", marketplaceName: "m1", description: "Formats code on save", installCount: 50 });
    expect(list[2]).toEqual({ pluginId: "deploy@m2", name: "deploy", marketplaceName: "m2", version: "2.0.0" });
  });
  test("refuses output that isn't the list", () => {
    expect(() => parseAvailable("No plugins installed.")).toThrow(/didn't return/);
    expect(() => parseAvailable("{ not json")).toThrow(/couldn't be read/);
    expect(parseAvailable('{"installed":[]}')).toEqual([]);
  });
  test("counts plugins per marketplace, largest first", () => {
    expect(marketplaceCounts(list)).toEqual([
      { name: "m1", count: 2 },
      { name: "m2", count: 1 },
    ]);
  });
  test("names every marketplace you've added, with 0 when you've installed all it offers", () => {
    const added = parseMarketplaces(JSON.stringify([{ name: "m1", source: "github", repo: "o/m1" }, { name: "all-installed", source: "directory", path: "/x" }]));
    expect(added).toEqual(["m1", "all-installed"]);
    expect(marketplaceCounts(list, added)).toEqual([
      { name: "m1", count: 2 },
      { name: "m2", count: 1 },
      { name: "all-installed", count: 0 },
    ]);
    expect(parseMarketplaces("No marketplaces configured")).toEqual([]);
  });
  test("an empty search lists the most installed first", () => {
    expect(searchAvailable(list, "").hits.map((a) => a.name)).toEqual(["linter", "formatter", "deploy"]);
  });
  test("a name match beats a description match, whatever the installs", () => {
    const r = searchAvailable(list, "format");
    expect(r.count).toBe(2);
    expect(r.hits.map((a) => a.name)).toEqual(["formatter", "linter"]);
  });
  test("a word that starts part of the name beats one inside it", () => {
    const more = [...list, { pluginId: "informatica@m3", name: "informatica", marketplaceName: "m3", installCount: 1e6 }, { pluginId: "code-format@m3", name: "code-format", marketplaceName: "m3", installCount: 1 }];
    expect(searchAvailable(more, "format").hits.map((a) => a.name)).toEqual(["formatter", "code-format", "informatica", "linter"]);
  });
  test("every word must match, in any case, and the marketplace name counts", () => {
    expect(searchAvailable(list, "LINTS formats").hits.map((a) => a.name)).toEqual(["linter"]);
    expect(searchAvailable(list, "m2").hits.map((a) => a.name)).toEqual(["deploy"]);
    expect(searchAvailable(list, "nothing-like-this").count).toBe(0);
  });
  test("stops at the limit but counts every match", () => {
    const r = searchAvailable(list, "", 1);
    expect(r.hits).toHaveLength(1);
    expect(r.count).toBe(3);
  });
});

describe("new plugin", () => {
  test("builds the init command", () => {
    expect(initArgs({ name: "cc-test-plugin" }).args).toEqual(["plugin", "init", "cc-test-plugin"]);
    expect(initArgs({ name: "my-helper", description: "  Helps\nwith  things ", with: ["skills", "hooks", "skills"] }).args).toEqual([
      "plugin",
      "init",
      "my-helper",
      "--description=Helps with things",
      "--with",
      "skills",
      "hooks",
    ]);
  });
  test("a description starting with a dash stays the description", () => {
    expect(initArgs({ name: "x", description: "--force" }).args).toEqual(["plugin", "init", "x", "--description=--force"]);
  });
  test("refuses bad names, reserved names and unknown parts", () => {
    for (const name of ["", "My-Helper", "my_helper", "-x", "a--b", "a b", "../x", "a".repeat(65), undefined]) expect(() => initArgs({ name })).toThrow(/lowercase letters/);
    expect(() => initArgs({ name: "skills-dir" })).toThrow(/reserved/);
    expect(() => initArgs({ name: "x", with: ["lsp"] })).toThrow(/Starter parts/);
    expect(() => initArgs({ name: "x", with: "skills" })).toThrow(/Starter parts/);
    expect(() => initArgs({ name: "x", description: "d".repeat(501) })).toThrow(/500/);
  });
  test("reads what init printed and the folder it made", () => {
    const out = '✔ Created plugin "cc-test-plugin" at ~/.claude/skills/cc-test-plugin\nIt will auto-load next session as cc-test-plugin@skills-dir. Run /reload-plugins to load it now.\n';
    const r = initResult(run(out), "cc-test-plugin", "/home/u/.claude/skills");
    expect(r.message).toBe('Created plugin "cc-test-plugin" at ~/.claude/skills/cc-test-plugin It will auto-load next session as cc-test-plugin@skills-dir. Run /reload-plugins to load it now.');
    expect(r.path.endsWith(join(".claude", "skills", "cc-test-plugin"))).toBe(true);
    expect(r.notes).toBe("");
  });
  test("keeps warnings printed before the Created line apart from the message", () => {
    const out = 'Found 1 warning:\n  ⚠ author: No author information provided.\n✔ Created plugin "x" at ~/.claude/skills/x\nIt will auto-load next session as x@skills-dir.\n';
    const r = initResult(run(out), "x", "/s");
    expect(r.notes).toBe("Found 1 warning: author: No author information provided.");
    expect(r.message).toBe('Created plugin "x" at ~/.claude/skills/x It will auto-load next session as x@skills-dir.');
  });
  test("falls back to the skills folder when the path isn't printed", () => {
    expect(initResult(run("done"), "x", "/s").path).toBe(join("/s", "x"));
  });
  test("throws init's own reason when it refuses", () => {
    expect(() => initResult(run("", 1, 'A plugin scaffold already exists at ~/.claude/skills/x. Pass --force to overwrite it.\n'), "x", "/s")).toThrow("A plugin scaffold already exists at ~/.claude/skills/x. Pass --force to overwrite it.");
  });
});

describe("plugins in a skills folder", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "cc-skills-"));
    await mkdir(join(dir, "helper", ".claude-plugin"), { recursive: true });
    await writeFile(join(dir, "helper", ".claude-plugin", "plugin.json"), JSON.stringify({ name: "helper", description: "Helps", version: "0.1.0" }));
    await mkdir(join(dir, "renamed", ".claude-plugin"), { recursive: true });
    await writeFile(join(dir, "renamed", ".claude-plugin", "plugin.json"), JSON.stringify({ name: "other-name", defaultEnabled: false }));
    await mkdir(join(dir, "plain-skill"), { recursive: true });
    await writeFile(join(dir, "plain-skill", "SKILL.md"), "---\nname: plain-skill\n---\n");
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  test("finds folders with a manifest, named by the manifest", async () => {
    const found = (await skillsDirPlugins(dir)).sort((a, b) => a.name.localeCompare(b.name));
    expect(found.map((p) => [p.name, p.defaultEnabled, p.version])).toEqual([
      ["helper", true, "0.1.0"],
      ["other-name", false, null],
    ]);
    expect(found[1]!.dir).toBe(join(dir, "renamed"));
  });
  test("a missing skills folder has none", async () => {
    expect(await skillsDirPlugins(join(dir, "nope"))).toEqual([]);
  });
});
