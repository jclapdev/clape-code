// Claude Code's plugin commands, as the app calls them: the checks on what the browser asks for, and the
// reading of what `claude plugin …` prints. Kept free of spawning so tests can feed it real output.
// Formats from code.claude.com/docs/en/plugins/cli-reference (checked 2026-10-18).
import { join } from "node:path";
import { untildify } from "../fs/paths";
import { WriteError } from "../fs/safeWrite";
import { ls, readJson } from "./md";

export interface Available {
  pluginId: string;
  name: string;
  marketplaceName: string;
  description?: string;
  version?: string;
  installCount?: number;
}

/** `claude plugin list --json --available` prints one object; `available` holds the plugins you haven't installed. */
export function parseAvailable(stdout: string): Available[] {
  const start = stdout.indexOf("{");
  if (start < 0) throw new WriteError(502, "Claude Code didn't return a list of plugins.");
  let parsed: { available?: unknown };
  try {
    parsed = JSON.parse(stdout.slice(start));
  } catch {
    throw new WriteError(502, "Claude Code's list of plugins couldn't be read.");
  }
  const list = Array.isArray(parsed.available) ? parsed.available : [];
  return list
    .filter((a: any) => a && typeof a.pluginId === "string" && typeof a.name === "string")
    .map((a: any) => ({
      pluginId: a.pluginId,
      name: a.name,
      marketplaceName: String(a.marketplaceName ?? a.pluginId.split("@")[1] ?? ""),
      ...(typeof a.description === "string" ? { description: a.description } : {}),
      ...(typeof a.version === "string" ? { version: a.version } : {}),
      ...(typeof a.installCount === "number" ? { installCount: a.installCount } : {}),
    }));
}

/** Marketplace names from `claude plugin marketplace list --json` (an array of objects with `name`); none if unreadable. */
export function parseMarketplaces(stdout: string): string[] {
  try {
    const arr = JSON.parse(stdout.slice(Math.max(0, stdout.indexOf("["))));
    return Array.isArray(arr) ? arr.map((m: any) => m?.name).filter((n: unknown): n is string => typeof n === "string" && n !== "") : [];
  } catch {
    return [];
  }
}

/**
 * Each marketplace and how many plugins it offers that you haven't installed, largest first. Marketplaces
 * you've added whose plugins you've all installed are listed with 0.
 */
export function marketplaceCounts(list: Available[], added: string[] = []) {
  const counts = new Map<string, number>(added.map((m) => [m, 0]));
  for (const a of list) counts.set(a.marketplaceName, (counts.get(a.marketplaceName) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Plugins whose name or description has every word, name matches first, then most installed. */
export function searchAvailable(list: Available[], q: string, limit = 40) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const score = (a: Available) => {
    const name = a.name.toLowerCase();
    const text = `${name} ${a.marketplaceName.toLowerCase()} ${(a.description ?? "").toLowerCase()}`;
    if (!words.every((w) => text.includes(w))) return -1;
    // Name matches first: words that start a part of the name (format → formatter, not informatica), then
    // words anywhere in the name, then one word in the name; most installed first within each.
    const starts = (w: string) => name.split(/[^a-z0-9]+/).some((part) => part.startsWith(w));
    const tier = !words.length ? 0 : words.every(starts) ? 3 : words.every((w) => name.includes(w)) ? 2 : words.some((w) => name.includes(w)) ? 1 : 0;
    return tier * 1e12 + (a.installCount ?? 0);
  };
  const scored = list.map((a) => [a, score(a)] as const).filter(([, s]) => s >= 0);
  return { count: scored.length, hits: scored.sort((x, y) => y[1] - x[1] || x[0].name.localeCompare(y[0].name)).slice(0, limit).map(([a]) => a) };
}

export const PLUGIN_ACTIONS = ["install", "uninstall", "enable", "disable"] as const;
export type PluginAction = (typeof PLUGIN_ACTIONS)[number];

// name@marketplace. Each part starts with a letter or number, so nothing can be read as a flag such as --all.
const PART = "[A-Za-z0-9][\\w.-]*";
const PLUGIN_ID = new RegExp(`^${PART}@${PART}$`);

/** The plugin command to run for a request from the browser, or a 400/404 saying what's wrong. */
export function pluginArgs(action: string, id: unknown): string[] {
  if (!(PLUGIN_ACTIONS as readonly string[]).includes(action)) throw new WriteError(404, "Unknown plugin action.");
  const s = String(id ?? "");
  if (s.length > 200 || !PLUGIN_ID.test(s)) throw new WriteError(400, "That isn't a plugin id. It looks like name@marketplace.");
  if (action === "install" && s.endsWith("@skills-dir")) throw new WriteError(400, "Plugins in your skills folder load without installing.");
  return ["plugin", action, s, "--json"];
}

const firstLines = (s: string, n = 3) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, n)
    .join(" ");

/**
 * What a `claude plugin <action> --json` run means. The last line of stdout is one JSON object with
 * `outcome` ("ok" or "failed") and `message`. Asking for the state a plugin is already in is not an error.
 * A usage error prints no JSON and gives its reason on stderr. Failures are thrown in Claude Code's own words.
 */
export function pluginResult(action: string, r: { code: number; out: string; err: string }): { message: string; already: boolean } {
  const last = r.out.trim().split("\n").pop() ?? "";
  let res: { outcome?: string; message?: string; failureCode?: string; alreadyInGoalState?: boolean } | null = null;
  try {
    const o = JSON.parse(last);
    if (o && typeof o === "object" && !Array.isArray(o)) res = o;
  } catch {
    /* no result line */
  }
  if (res?.alreadyInGoalState || res?.failureCode === "already_in_goal_state") return { message: res.message ?? "", already: true };
  if (res?.outcome === "ok" && r.code === 0) return { message: res.message ?? "", already: false };
  if (res?.outcome === "failed" || r.code !== 0) {
    throw new WriteError(400, res?.message || firstLines(r.err) || firstLines(r.out) || `Claude Code couldn't ${action} the plugin.`);
  }
  return { message: res?.message ?? firstLines(r.out), already: false };
}

export const STARTER_PARTS = ["skills", "agents", "hooks", "mcp", "output-style"] as const;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** `claude plugin init` arguments for the New plugin form, or a 400 saying what's wrong. */
export function initArgs(body: { name?: unknown; description?: unknown; with?: unknown }): { name: string; args: string[] } {
  const name = String(body.name ?? "").trim();
  if (!SLUG.test(name) || name.length > 64) throw new WriteError(400, "Use a name of up to 64 lowercase letters, numbers and single hyphens, such as my-helper.");
  if (["inline", "skills-dir", "synced"].includes(name)) throw new WriteError(400, `"${name}" is reserved by Claude Code. Pick another name.`);
  const description = typeof body.description === "string" ? body.description.replace(/\s+/g, " ").trim() : "";
  if (description.length > 500) throw new WriteError(400, "Keep the description under 500 characters.");
  const parts = body.with === undefined ? [] : body.with;
  if (!Array.isArray(parts) || parts.some((p) => !(STARTER_PARTS as readonly string[]).includes(p))) {
    throw new WriteError(400, `Starter parts can be: ${STARTER_PARTS.join(", ")}.`);
  }
  const unique = [...new Set(parts as string[])];
  // --description=… keeps a description that starts with "-" from being read as a flag.
  return { name, args: ["plugin", "init", name, ...(description ? [`--description=${description}`] : []), ...(unique.length ? ["--with", ...unique] : [])] };
}

/**
 * What `claude plugin init` printed, without its ticks: from the "Created plugin" line on as the message,
 * any warnings it printed before that as notes, and the folder it says it made.
 */
export function initResult(r: { code: number; out: string; err: string }, name: string, skillsDir: string): { message: string; notes: string; path: string } {
  if (r.code !== 0) throw new WriteError(400, firstLines(r.err, 4) || firstLines(r.out, 4) || "Claude Code couldn't create the plugin.");
  const lines = r.out
    .split("\n")
    .map((l) => l.replace(/^[^\w"~/]+/, "").trim())
    .filter(Boolean);
  const created = lines.findIndex((l) => l.startsWith("Created plugin"));
  const at = r.out.match(/Created plugin "[^"]*" at (.+)$/m)?.[1]?.trim();
  return {
    message: (created >= 0 ? lines.slice(created) : lines).join(" "),
    notes: created > 0 ? lines.slice(0, created).join(" ") : "",
    path: at ? untildify(at) : join(skillsDir, name),
  };
}

export interface SkillsDirPlugin {
  name: string; // manifest name; the plugin loads as <name>@skills-dir
  dir: string;
  description: string;
  version: string | null;
  defaultEnabled: boolean;
}

/** Plugins kept as folders with a .claude-plugin/plugin.json in a skills directory. */
export async function skillsDirPlugins(skillsDir: string): Promise<SkillsDirPlugin[]> {
  const out: SkillsDirPlugin[] = [];
  for (const f of await ls(skillsDir)) {
    if (f === "synced") continue;
    const dir = join(skillsDir, f);
    const m = await readJson<{ name?: string; description?: string; version?: string; defaultEnabled?: boolean }>(join(dir, ".claude-plugin", "plugin.json"));
    if (!m) continue;
    out.push({ name: typeof m.name === "string" && m.name ? m.name : f, dir, description: m.description ?? "", version: m.version ?? null, defaultEnabled: m.defaultEnabled !== false });
  }
  return out;
}
