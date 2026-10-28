// Changes the Settings page makes to a settings.json or keybindings.json object.
// Only keys and values documented on code.claude.com/docs/en/settings-reference, /statusline,
// /sandboxing, /model-config and /keybindings (read 2026-10-18) are accepted.
import { WriteError } from "../fs/safeWrite";
import { KEY_ACTIONS, KEY_CONTEXTS } from "./keybindingDocs";
import type { ReferenceSetting } from "./settingsReference";

type Obj = Record<string, any>;

export const PERMISSION_LISTS = ["allow", "ask", "deny"] as const;
export const SANDBOX_FLAGS = ["enabled", "autoAllowBashIfSandboxed", "allowUnsandboxedCommands", "failIfUnavailable"] as const;
export const SANDBOX_LISTS = ["excludedCommands", "filesystem.allowWrite", "filesystem.denyWrite", "filesystem.denyRead", "network.allowedDomains", "network.deniedDomains"] as const;
export const BUILT_IN_THEMES = ["auto", "dark", "light", "dark-daltonized", "light-daltonized", "dark-ansi", "light-ansi"];
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type SettingsChange =
  | { op: "permission-remove"; list: string; rule: string }
  | { op: "model"; value: string | null }
  | { op: "env-set"; name: string; value: string }
  | { op: "env-remove"; name: string }
  | { op: "statusline"; command: string | null; padding?: number | null; refreshInterval?: number | null; hideVimModeIndicator?: boolean }
  | { op: "sandbox-flag"; field: string; value: boolean | null }
  | { op: "sandbox-list"; field: string; add?: string; remove?: string }
  | { op: "theme"; value: string | null };

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** Drop `o[key]` when it's an object left with nothing in it, so removing the last entry leaves no `{}` behind. */
function pruneEmpty(o: Obj, key: string) {
  if (isObj(o[key]) && !Object.keys(o[key]).length) delete o[key];
}

/** Applies one change from the Settings page, leaving every other key as it was. */
export function applySettingsChange(o: Obj, c: SettingsChange, themes: string[] = []) {
  switch (c.op) {
    case "permission-remove": {
      if (!PERMISSION_LISTS.includes(c.list as any)) throw new WriteError(400, "Pick allow, ask first, or never allow.");
      const list = o.permissions?.[c.list];
      if (!Array.isArray(list) || !list.includes(c.rule)) throw new WriteError(404, "That rule isn't in this file any more.");
      o.permissions[c.list] = list.filter((r: unknown) => r !== c.rule);
      if (!o.permissions[c.list].length) delete o.permissions[c.list];
      pruneEmpty(o, "permissions");
      return;
    }
    case "model": {
      const v = typeof c.value === "string" ? c.value.trim() : null;
      if (v && !/^[\w.:/\-\[\]@]+$/.test(v)) throw new WriteError(400, "Write a model alias such as sonnet, or a full model name such as claude-opus-5-5.");
      if (v) o.model = v;
      else delete o.model;
      return;
    }
    case "env-set": {
      const name = String(c.name ?? "").trim();
      if (!ENV_NAME.test(name)) throw new WriteError(400, "A variable name is letters, numbers and underscores, and doesn't start with a number.");
      if (typeof c.value !== "string") throw new WriteError(400, "Write the variable's value.");
      if (!isObj(o.env)) o.env = {};
      o.env[name] = c.value;
      return;
    }
    case "env-remove": {
      if (!isObj(o.env) || !(c.name in o.env)) throw new WriteError(404, "That variable isn't in this file any more.");
      delete o.env[c.name];
      pruneEmpty(o, "env");
      return;
    }
    case "statusline": {
      const command = typeof c.command === "string" ? c.command.trim() : "";
      if (!command) {
        delete o.statusLine;
        return;
      }
      const line: Obj = { type: "command", command };
      if (c.padding != null) {
        if (!Number.isInteger(c.padding) || c.padding < 0) throw new WriteError(400, "Padding is a whole number of characters, 0 or more.");
        line.padding = c.padding;
      }
      if (c.refreshInterval != null) {
        if (!Number.isInteger(c.refreshInterval) || c.refreshInterval < 1) throw new WriteError(400, "Refresh every is a whole number of seconds, 1 or more.");
        line.refreshInterval = c.refreshInterval;
      }
      if (c.hideVimModeIndicator) line.hideVimModeIndicator = true;
      o.statusLine = line;
      return;
    }
    case "sandbox-flag": {
      if (!SANDBOX_FLAGS.includes(c.field as any)) throw new WriteError(400, "That isn't a sandbox setting this page changes.");
      if (c.value !== null && typeof c.value !== "boolean") throw new WriteError(400, "Pick on, off or not set.");
      if (c.value === null) {
        if (isObj(o.sandbox)) delete o.sandbox[c.field];
        pruneEmpty(o, "sandbox");
      } else {
        if (!isObj(o.sandbox)) o.sandbox = {};
        o.sandbox[c.field] = c.value;
      }
      return;
    }
    case "sandbox-list": {
      if (!SANDBOX_LISTS.includes(c.field as any)) throw new WriteError(400, "That isn't a sandbox list this page changes.");
      const parts = c.field.split(".");
      const leaf = parts.pop()!;
      if (c.add !== undefined) {
        const add = String(c.add).trim();
        if (!add) throw new WriteError(400, "Write the entry to add.");
        if (!isObj(o.sandbox)) o.sandbox = {};
        let parent = o.sandbox;
        for (const p of parts) {
          if (!isObj(parent[p])) parent[p] = {};
          parent = parent[p];
        }
        if (!Array.isArray(parent[leaf])) parent[leaf] = [];
        if (!parent[leaf].includes(add)) parent[leaf].push(add);
        return;
      }
      const chain: Obj[] = [o.sandbox];
      for (const p of parts) chain.push(chain[chain.length - 1]?.[p]);
      const parent = chain[chain.length - 1];
      if (!isObj(parent) || !Array.isArray(parent[leaf]) || !parent[leaf].includes(c.remove)) throw new WriteError(404, "That entry isn't in this file any more.");
      parent[leaf] = parent[leaf].filter((x: unknown) => x !== c.remove);
      if (!parent[leaf].length) delete parent[leaf];
      for (let i = parts.length - 1; i >= 0; i--) pruneEmpty(chain[i], parts[i]);
      pruneEmpty(o, "sandbox");
      return;
    }
    case "theme": {
      if (c.value === null || c.value === "") {
        delete o.theme;
        return;
      }
      const ok = BUILT_IN_THEMES.includes(c.value) || (c.value.startsWith("custom:") && themes.includes(c.value.slice(7)));
      if (!ok) throw new WriteError(400, "Pick one of Claude Code's themes or one of your custom themes.");
      o.theme = c.value;
      return;
    }
    default:
      throw new WriteError(400, "The Settings page can't make that change.");
  }
}

/** Env values can be secrets: send names only, with where each is set. */
export function redactEnv(o: Obj | null | undefined): Obj | null | undefined {
  if (!isObj(o) || !isObj(o.env)) return o;
  return { ...o, env: Object.fromEntries(Object.keys(o.env).map((k) => [k, null])) };
}

// ---- Keyboard shortcuts ----

/** Keys the docs say can't be rebound. */
const RESERVED = new Set(["ctrl+c", "ctrl+d", "ctrl+m", "ctrl+[", "ctrl+i", "ctrl+h"]);
const MODIFIERS = new Set(["ctrl", "control", "shift", "alt", "opt", "option", "meta", "cmd", "command", "super", "win"]);

/** Lower-cases a keystroke and checks each part is a documented modifier followed by one key; chords are space-separated. */
export function normaliseKeys(keys: string): string {
  const strokes = keys.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!strokes.length) throw new WriteError(400, "Write the keys, such as ctrl+e, or a chord such as ctrl+k ctrl+s.");
  for (const s of strokes) {
    const parts = s.split("+");
    const key = parts.pop();
    if (!key || parts.some((p) => !MODIFIERS.has(p))) throw new WriteError(400, `"${s}" isn't a keystroke Claude Code reads. Use modifiers such as ctrl, shift, meta or cmd joined with +, then one key.`);
  }
  const out = strokes.join(" ");
  if (RESERVED.has(out.replace(/^control\+/, "ctrl+"))) throw new WriteError(400, `${out} can't be rebound: Claude Code always uses it for itself.`);
  return out;
}

const blocksOf = (o: Obj): Obj[] => {
  if (!Array.isArray(o.bindings)) o.bindings = [];
  return o.bindings;
};

/** Binds `keys` to `action` in `context` (null unbinds Claude Code's default), creating the context block if needed. */
export function setKeybinding(o: Obj, context: string, keys: string, action: string | null) {
  if (!KEY_CONTEXTS.some((c) => c.name === context)) throw new WriteError(400, "Pick one of the contexts Claude Code lists.");
  if (action !== null && !KEY_ACTIONS.some((a) => a.action === action)) throw new WriteError(400, "Pick one of the actions Claude Code lists, or Unbind.");
  const k = normaliseKeys(keys);
  if (!Object.keys(o).length) Object.assign(o, { $schema: "https://www.schemastore.org/claude-code-keybindings.json", $docs: "https://code.claude.com/docs/en/keybindings" });
  const blocks = blocksOf(o);
  let block = blocks.find((b) => isObj(b) && b.context === context && isObj(b.bindings));
  if (!block) {
    block = { context, bindings: {} };
    blocks.push(block);
  }
  // The same keys written another way (Ctrl+E vs ctrl+e) would be a duplicate binding.
  for (const existing of Object.keys(block.bindings)) if (existing.toLowerCase() === k) delete block.bindings[existing];
  block.bindings[k] = action;
}

/** Removes your entry for `keys` in `context`, so Claude Code's default for those keys applies again. */
export function removeKeybinding(o: Obj, context: string, keys: string) {
  const blocks = blocksOf(o);
  const i = blocks.findIndex((b) => isObj(b) && b.context === context && isObj(b.bindings) && keys in b.bindings);
  if (i < 0) throw new WriteError(404, "That shortcut isn't in keybindings.json any more.");
  delete blocks[i].bindings[keys];
  if (!Object.keys(blocks[i].bindings).length) blocks.splice(i, 1);
}

// ---- Any documented setting (spec 005) ----

export type SettingsTarget = "user" | "project" | "local";

/** The files a setting can be written to, from its Scope line: "Any file", or the ones it names, such as "User or managed". */
export function writableIn(scope: string): SettingsTarget[] {
  if (/any file/i.test(scope)) return ["user", "project", "local"];
  return (["user", "project", "local"] as const).filter((t) => new RegExp(`\\b${t}\\b`, "i").test(scope));
}

/**
 * The value to write for one documented setting, or undefined to remove the key: off, empty or "Not set" removes it,
 * so Claude Code's own default applies. A switch is the exception, since removing its key can leave it on: off writes
 * `false` when the setting is on by default or another settings file turns it on, and on removes the key only when
 * the setting is on by default and no other file turns it off. `others` holds this key's values in the other user,
 * project and local files.
 */
export function settingValue(s: ReferenceSetting, target: SettingsTarget, value: unknown, others: unknown[] = []): unknown {
  if (s.section) throw new WriteError(400, "This setting is changed in its own section of the Settings page.");
  if (s.type === "other") throw new WriteError(400, "This setting is changed as text.");
  const targets = writableIn(s.scope);
  if (!targets.includes(target))
    throw new WriteError(400, targets.join() === "user" ? `${s.key} can be set only in your settings for every project.` : `${s.key} can't be set in this file (${s.scope}).`);
  if (value === null || value === undefined || value === "") return undefined;
  switch (s.type) {
    case "boolean":
      if (typeof value !== "boolean") throw new WriteError(400, "Pick on or off.");
      const onByDefault = /^`true`/.test(s.default ?? "");
      if (value) return onByDefault && !others.includes(false) ? undefined : true;
      return onByDefault || others.includes(true) ? false : undefined;
    case "choice":
      if (typeof value !== "string" || !s.choices?.includes(value)) throw new WriteError(400, `Pick one of: ${s.choices?.join(", ")}.`);
      return value;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) throw new WriteError(400, "Write a number.");
      return value;
    case "string":
      if (typeof value !== "string") throw new WriteError(400, "Write the value as text.");
      return value.trim() || undefined;
    case "list": {
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) throw new WriteError(400, "Write one value per line.");
      const list = value.map((v: string) => v.trim()).filter(Boolean);
      return list.length ? list : undefined;
    }
  }
}
