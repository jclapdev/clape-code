// Setting one key in a settings file's text: every line it doesn't touch stays byte-for-byte the same (005-S3).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setKeyInText } from "../src/parsers/jsonText";
import { settingValue, writableIn } from "../src/parsers/settingsEdit";
import shipped from "../src/data/settings-reference.json";
import type { ReferenceSetting, SettingsReference } from "../src/parsers/settingsReference";

const fixture = readFileSync(join(import.meta.dir, "fixtures", "settings.json"), "utf8");
const lines = (t: string) => t.split("\n");
/** The fixture's lines that aren't in `t`; empty when every line survived. */
const lost = (t: string) => lines(fixture).filter((l) => !lines(t).includes(l));
const setting = (k: string) => (shipped as SettingsReference).topics.flatMap((t) => t.settings).find((s) => s.key === k) as ReferenceSetting;

describe("setKeyInText", () => {
  test("a boolean on adds one line and off gives the file back byte-for-byte", () => {
    const on = setKeyInText(fixture, "verbose", true);
    expect(JSON.parse(on)).toEqual({ verbose: true, ...JSON.parse(fixture) });
    expect(lines(on).length).toBe(lines(fixture).length + 1);
    expect(lost(on)).toEqual([]);
    expect(setKeyInText(on, "verbose", undefined)).toBe(fixture);
  });

  test("a choice and a number, then changed again, touch only their own lines", () => {
    let t = setKeyInText(fixture, "editorMode", "vim");
    t = setKeyInText(t, "cleanupPeriodDays", 14);
    expect(JSON.parse(t)).toMatchObject({ editorMode: "vim", cleanupPeriodDays: 14, model: "opus" });
    expect(lost(t)).toEqual([]);
    const changed = setKeyInText(t, "editorMode", "normal");
    expect(lines(changed).filter((l, i) => l !== lines(t)[i])).toEqual(['  "editorMode": "normal",']);
    // The fixture already has "tui": "fullscreen"; changing it changes that line only.
    const tui = setKeyInText(fixture, "tui", "default");
    expect(lines(tui).filter((l, i) => l !== lines(fixture)[i])).toEqual(['  "tui": "default",']);
    expect(setKeyInText(setKeyInText(changed, "editorMode", undefined), "cleanupPeriodDays", undefined)).toBe(fixture);
  });

  test("dotted keys are written nested, and removing the last one removes the object it made", () => {
    const t = setKeyInText(fixture, "worktree.baseRef", "head");
    expect(JSON.parse(t).worktree).toEqual({ baseRef: "head" });
    expect(lost(t)).toEqual([]);
    const two = setKeyInText(t, "worktree.symlinkDirectories", ["node_modules", ".cache"]);
    expect(JSON.parse(two).worktree).toEqual({ symlinkDirectories: ["node_modules", ".cache"], baseRef: "head" });
    expect(two).toContain('  "worktree": {\n    "symlinkDirectories": [\n      "node_modules",\n      ".cache"\n    ],\n    "baseRef": "head"\n  },');
    expect(setKeyInText(setKeyInText(two, "worktree.symlinkDirectories", undefined), "worktree.baseRef", undefined)).toBe(fixture);
  });

  test("the last key of an object, an empty object, an empty file and tabs", () => {
    expect(setKeyInText('{\n  "a": 1,\n  "b": 2\n}\n', "b", undefined)).toBe('{\n  "a": 1\n}\n');
    expect(setKeyInText('{\n  "a": 1\n}\n', "a", undefined)).toBe("{}\n");
    expect(setKeyInText("{}\n", "tui", "default")).toBe('{\n  "tui": "default"\n}\n');
    expect(setKeyInText("", "tui", "default")).toBe('{\n  "tui": "default"\n}\n');
    expect(setKeyInText('{\n\t"a": {}\n}\n', "a.b", true)).toBe('{\n\t"a": {\n\t\t"b": true\n\t}\n}\n');
    expect(setKeyInText('{"a": 1}', "b", 2)).toBe('{"b": 2, "a": 1}');
    expect(() => setKeyInText('{"a": "x"}', "a.b", 2)).toThrow("a isn't an object in this file");
  });
});

describe("settingValue", () => {
  test("off, empty and Not set remove the key; values are checked against the type", () => {
    expect(settingValue(setting("verbose"), "project", true)).toBe(true);
    expect(settingValue(setting("verbose"), "project", null)).toBeUndefined();
    expect(settingValue(setting("tui"), "local", "fullscreen")).toBe("fullscreen");
    expect(() => settingValue(setting("tui"), "local", "huge")).toThrow("Pick one of: default, fullscreen.");
    expect(settingValue(setting("cleanupPeriodDays"), "user", 7)).toBe(7);
    expect(() => settingValue(setting("cleanupPeriodDays"), "user", "7")).toThrow("Write a number.");
    expect(settingValue(setting("worktree.symlinkDirectories"), "user", [" a ", "", "b"])).toEqual(["a", "b"]);
    expect(settingValue(setting("worktree.symlinkDirectories"), "user", [""])).toBeUndefined();
    expect(() => settingValue(setting("permissions.allow"), "user", ["x"])).toThrow("its own section");
  });

  test("a switch writes false when off would leave the setting on (#124)", () => {
    // Off by default: off removes the key unless another file turns it on.
    expect(settingValue(setting("verbose"), "project", false)).toBeUndefined();
    expect(settingValue(setting("verbose"), "project", false, [true, undefined])).toBe(false);
    expect(settingValue(setting("verbose"), "project", false, [false])).toBeUndefined();
    expect(settingValue(setting("verbose"), "project", true, [false])).toBe(true);
    // On by default: off writes false; on removes the key unless another file turns it off.
    expect(setting("autoCompactEnabled").default).toBe("`true`");
    expect(settingValue(setting("autoCompactEnabled"), "local", false)).toBe(false);
    expect(settingValue(setting("autoCompactEnabled"), "local", true)).toBeUndefined();
    expect(settingValue(setting("autoCompactEnabled"), "local", true, [false])).toBe(true);
  });

  test("a User or managed setting is refused for a project's files", () => {
    expect(setting("desktopSessionCleanupPeriodDays").scope).toBe("User or managed");
    expect(writableIn("User or managed")).toEqual(["user"]);
    expect(writableIn("User, local, or managed")).toEqual(["user", "local"]);
    expect(writableIn("Any file")).toEqual(["user", "project", "local"]);
    for (const t of ["project", "local"] as const) expect(() => settingValue(setting("desktopSessionCleanupPeriodDays"), t, 3)).toThrow("can be set only in your settings for every project");
    expect(settingValue(setting("desktopSessionCleanupPeriodDays"), "user", 3)).toBe(3);
  });
});
