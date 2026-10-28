import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

// Every location is read from the environment on each call so tests can point
// the app at a fixture tree with CC_HOME / CC_CLAUDE_DIR / CC_APP_DIR.
export function home(): string {
  return process.env.CC_HOME ?? homedir();
}

export function claudeDir(): string {
  return process.env.CC_CLAUDE_DIR ?? process.env.CLAUDE_CONFIG_DIR ?? join(home(), ".claude");
}

/**
 * Claude Code's `.claude.json`. With CLAUDE_CONFIG_DIR set, Claude Code keeps it inside that folder (seen with
 * Claude Code 2.1.311; the docs don't say); otherwise it sits in the home folder. CC_CLAUDE_DIR (tests) keeps the home one.
 */
export function claudeJson(): string {
  if (!process.env.CC_CLAUDE_DIR && process.env.CLAUDE_CONFIG_DIR) return join(process.env.CLAUDE_CONFIG_DIR, ".claude.json");
  return join(home(), ".claude.json");
}

export function appDir(): string {
  if (process.env.CC_APP_DIR) return process.env.CC_APP_DIR;
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(home(), "AppData", "Roaming"), "control-center");
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(home(), ".config"), "control-center");
}

export const backupsDir = () => join(appDir(), "backups");
export const archiveDir = () => join(appDir(), "archive");
export const indexDbPath = () => join(appDir(), "index.sqlite");
export const configPath = () => join(appDir(), "config.json");
export const statePath = () => join(appDir(), "state.json");

const caseInsensitive = process.platform === "win32" || process.platform === "darwin";

/** True when `child` is `parent` or inside it. */
export function isInside(child: string, parent: string): boolean {
  let c = resolve(child);
  let p = resolve(parent);
  if (caseInsensitive) {
    c = c.toLowerCase();
    p = p.toLowerCase();
  }
  return c === p || c.startsWith(p.endsWith(sep) ? p : p + sep);
}

/** Show paths under the home folder as `~/…`, with forward slashes. */
export function tildify(p: string): string {
  const h = home();
  const out = isInside(p, h) ? "~" + p.slice(h.length) : p;
  return out.split(sep).join("/");
}

/** Expand a leading `~` and normalise to an absolute path. */
export function untildify(p: string): string {
  if (p === "~") return home();
  if (p.startsWith("~/") || p.startsWith("~\\")) return join(home(), p.slice(2));
  return resolve(p);
}
