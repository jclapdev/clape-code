import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { claudeDir } from "../fs/paths";
import { WriteError } from "../fs/safeWrite";

/**
 * The installed Claude Code. Started from Finder or at login the app may not have the shell's PATH, so the usual
 * install folders are tried too. `CC_CLAUDE_BIN` replaces the lookup (tests use a fake).
 */
export function findClaude(): string | null {
  if (process.env.CC_CLAUDE_BIN) return existsSync(process.env.CC_CLAUDE_BIN) ? process.env.CC_CLAUDE_BIN : null;
  const onPath = Bun.which("claude");
  if (onPath) return onPath;
  const home = homedir();
  const candidates =
    process.platform === "win32"
      ? [join(home, ".local", "bin", "claude.exe"), join(process.env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "Programs", "claude", "claude.exe")]
      : [join(home, ".local", "bin", "claude"), join(home, ".claude", "local", "claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude"];
  return candidates.find((p) => existsSync(p)) ?? null;
}

export const MISSING_CLAUDE = "Claude Code isn't installed where the app can find it.";

/**
 * The environment for Claude Code when the app is pointed at another Claude folder (CC_CLAUDE_DIR), so it reads
 * that folder's login and settings. Otherwise undefined: setting CLAUDE_CONFIG_DIR to the default folder would
 * make Claude Code look for a differently keyed Keychain entry.
 */
export function claudeEnv(): Record<string, string> | undefined {
  if (!process.env.CC_CLAUDE_DIR) return undefined;
  return { ...(process.env as Record<string, string>), CLAUDE_CONFIG_DIR: claudeDir() };
}

/** Runs a Claude Code command and returns its output, or an error in its own words. */
export async function runClaude(args: string[], cwd?: string, timeoutMs = 120_000) {
  const claude = findClaude();
  if (!claude) throw new WriteError(400, MISSING_CLAUDE);
  const p = Bun.spawn([claude, ...args], { cwd: cwd ?? claudeDir(), env: claudeEnv(), stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const timer = setTimeout(() => p.kill(), timeoutMs);
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  const code = await p.exited;
  clearTimeout(timer);
  return { code, out, err };
}
