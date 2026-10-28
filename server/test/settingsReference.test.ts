// The settings reference parser, against the copy shipped with the app (scripts/settings-reference.ts).
import { describe, expect, test } from "bun:test";
import { firstSentence, parseSettingsReference, unlink, type SettingsReference } from "../src/parsers/settingsReference";
import { valueNow } from "../src/parsers/settings";
import shipped from "../src/data/settings-reference.json";

const ref = shipped as SettingsReference;
const all = ref.topics.flatMap((t) => t.settings.map((s) => ({ ...s, topic: t.title })));
const byKey = (k: string) => all.find((s) => s.key === k);

describe("the shipped settings reference", () => {
  test("topics, without the index, organization, global config and see-also ones", () => {
    const titles = ref.topics.map((t) => t.title);
    for (const t of ["Settings index", "Enterprise and managed settings", "Global config settings", "See also"]) expect(titles).not.toContain(t);
    expect(titles).toContain("Interface and terminal");
    expect(titles).toContain("Remote, desktop, and notifications");
    // 19 `## ` topics on the page on 27 Oct, less the four above and "Tools", whose settings are all Managed.
    expect(ref.topics.length).toBe(14);
    for (const t of ref.topics) expect(t.settings.length).toBeGreaterThan(0);
  });

  test("no Managed or Global config settings, and no setting without a type", () => {
    expect(all.length).toBeGreaterThan(150);
    for (const s of all) {
      expect(["Managed", "Global config"]).not.toContain(s.scope);
      expect(s.typeText).toBeTruthy();
    }
    expect(byKey("taskOutputMaxChars")).toBeUndefined();
    expect(byKey("availableModelsMatch")).toBeUndefined();
  });

  test("tui is a choice of default and fullscreen under Interface and terminal", () => {
    expect(byKey("tui")).toMatchObject({ topic: "Interface and terminal", type: "choice", choices: ["default", "fullscreen"], description: "Choose the terminal UI renderer.", scope: "Any file" });
  });

  test("the notification settings", () => {
    for (const k of ["agentPushNotifEnabled", "inputNeededNotifEnabled"]) expect(byKey(k)).toMatchObject({ topic: "Remote, desktop, and notifications", type: "boolean" });
    expect(byKey("preferredNotifChannel")?.choices).toContain("terminal_bell");
  });

  test("descriptions are one sentence with no Markdown links", () => {
    for (const s of all) {
      expect(s.description).toMatch(/[.!?]$/);
      expect(s.description).not.toMatch(/\]\(/);
    }
  });

  test("settings the existing sections edit say which section", () => {
    expect(byKey("permissions.allow")?.section).toBe("permissions");
    expect(byKey("sandbox.network.allowedDomains")?.section).toBe("sandbox");
    expect(byKey("statusLine")?.section).toBe("status-line");
    expect(byKey("model")?.section).toBe("model");
    expect(byKey("env")?.section).toBe("env");
    expect(byKey("tui")?.section).toBeUndefined();
  });
});

describe("parsing", () => {
  const md = [
    "## Settings index",
    "### `skipped`",
    "Not here.",
    "* **Scope**: [`Any file`](#scopes)",
    "* **Type**: Boolean",
    "## Interface",
    "Intro text.",
    "### `pick`",
    "",
    "Choose a [thing](https://x.example/a.md), such as `a.b`. More text.",
    "",
    "* **Scope**: [`User or managed`](#scopes). Extra.",
    "* **Type**: string, one of:",
    '  * `"one"`: first',
    '  * `"two"`: second',
    "* **Default**: unset, so [it](#x) picks",
    "",
    "```json",
    "### `notAHeading`",
    "```",
    "### `org`",
    "Only an organization.",
    "* **Scope**: [`Managed`](#scopes)",
    "* **Type**: Boolean",
    "### `gone`",
    "Removed.",
    "### `count`",
    "How many.",
    "* **Scope**: [`Any file`](#scopes)",
    "* **Type**: number of days, a whole number",
    "### `paths`",
    "Where.",
    "* **Scope**: [`Any file`](#scopes)",
    "* **Type**: array of strings",
  ].join("\n");

  test("keys, first sentence, type, choices, default and scope", () => {
    const r = parseSettingsReference(md, "2026-10-27T00:00:00Z");
    expect(r.topics.map((t) => t.title)).toEqual(["Interface"]);
    expect(r.topics[0].settings).toEqual([
      { key: "pick", description: "Choose a thing, such as `a.b`.", type: "choice", typeText: "string, one of:", choices: ["one", "two"], default: "unset, so it picks", scope: "User or managed" },
      { key: "count", description: "How many.", type: "number", typeText: "number of days, a whole number", default: null, scope: "Any file" },
      { key: "paths", description: "Where.", type: "list", typeText: "array of strings", default: null, scope: "Any file" },
    ]);
  });

  test("helpers", () => {
    expect(unlink("see [Model](https://a/b.md#c) and [`x`](#x)")).toBe("see Model and `x`");
    expect(firstSentence("Use `.mcp.json` files, e.g. this one. Then more.")).toBe("Use `.mcp.json` files, e.g. this one.");
  });

  test("a code span opened with two backticks holds backticks and full stops (#123)", () => {
    const docs = "Turn off inline shell execution for `` !`...` `` and ` ```! ` blocks in skills and custom commands. Then more.";
    expect(firstSentence(docs)).toBe("Turn off inline shell execution for `` !`...` `` and ` ```! ` blocks in skills and custom commands.");
    expect(firstSentence("A lone ` backtick. Then more.")).toBe("A lone ` backtick.");
    expect(byKey("disableSkillShellExecution")?.description).toBe(
      "Turn off inline shell execution for `` !`...` `` and ` ```! ` blocks in skills and custom commands from user, project, plugin, or additional-directory sources.",
    );
  });
});

describe("descriptions without markup", () => {
  const one = (body: string) => parseSettingsReference(`## Topic\n\n### \`k\`\n\n${body}\n\n* **Scope**: \`Any file\`\n* **Type**: Boolean\n* **Default**: unset\n`).topics[0].settings[0].description;

  test("a callout before the description is skipped; a callout alone gives its text without markers", () => {
    expect(one("> [!WARNING]\n>\n> Deprecated since v2.\n\nThe real description. More.")).toBe("The real description.");
    expect(one("> [!WARNING]\n>\n> Deprecated, and replaced by [`b`](#b). Still read.")).toBe("Deprecated, and replaced by `b`.");
  });

  test("bold and italic become plain text; code spans stay", () => {
    expect(one("The picker has a **Default** option and an *other* one, with `**raw**` and `snake_case_key`.")).toBe(
      "The picker has a Default option and an other one, with `**raw**` and `snake_case_key`.",
    );
  });

  test("no description in the shipped copy has callout or emphasis markup", () => {
    for (const s of all) {
      expect(s.description).not.toContain("[!");
      expect(s.description).not.toContain("**");
      expect(s.description.startsWith(">")).toBe(false);
    }
  });
});

describe("valueNow", () => {
  test("highest file wins; dotted keys are nested; lists combine", () => {
    const files = { user: { tui: "fullscreen", sandbox: { network: { allowedDomains: ["a"] } } }, local: { tui: "default", sandbox: { network: { allowedDomains: ["b"] } } } };
    expect(valueNow(files, "tui")).toEqual({ value: "default", from: "local", setIn: ["local", "user"] });
    expect(valueNow(files, "sandbox.network.allowedDomains")).toEqual({ value: ["b", "a"], from: "combined", setIn: ["local", "user"] });
    expect(valueNow(files, "sandbox.network.x")).toEqual({ from: null, setIn: [] });
    expect(valueNow(files, "sandbox.network.allowedDomains.length")).toEqual({ from: null, setIn: [] });
  });
});
