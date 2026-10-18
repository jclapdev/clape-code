import { relative, sep } from "node:path";
import { claudeDir, claudeJson, isInside } from "./paths";

export type Access = "edit" | "app" | "secret" | "outside";

const toPosix = (p: string) => p.split(sep).join("/");

// Paths under ~/.claude that hold tokens, account copies or shell environments.
// They are never read or sent to the browser.
const SECRET = [
  /^sessions\/[^/]+\.key$/,
  /^daemon(\/|$)/,
  /^shell-snapshots(\/|$)/,
  /^backups(\/|$)/,
  /^paste-cache(\/|$)/,
  /^session-env(\/|$)/,
  /^ide(\/|$)/,
];

// Paths under ~/.claude that the user owns and may edit.
const EDITABLE = [
  /^settings(\.local)?\.json$/,
  /^CLAUDE\.md$/,
  /^keybindings\.json$/,
  /^commands(\/|$)/,
  /^rules(\/|$)/,
  /^output-styles(\/|$)/,
  /^hooks(\/|$)/,
  /^agents(\/|$)/,
  /^plans(\/|$)/,
  /^workflows(\/|$)/,
  /^scheduled-tasks(\/|$)/,
  /^themes(\/|$)/,
  /^projects\/[^/]+\/memory(\/|$)/,
  /^agent-memory(\/|$)/,
];

let projectDirs: string[] = [];

/** Called by the project scanner whenever the set of known projects changes. */
export function setProjectDirs(dirs: string[]) {
  projectDirs = dirs;
}

export function classify(abs: string): Access {
  const cd = claudeDir();
  if (isInside(abs, cd)) {
    const rel = toPosix(relative(cd, abs));
    if (SECRET.some((r) => r.test(rel))) return "secret";
    if (/^skills\/synced(\/|$)/.test(rel)) return "app";
    if (/^skills(\/|$)/.test(rel)) return "edit";
    if (EDITABLE.some((r) => r.test(rel))) return "edit";
    return "app";
  }
  // Holds account details (oauthAccount, userID, …): never served raw. The server reads only the fields it needs.
  if (isInside(abs, claudeJson())) return "secret";
  for (const dir of projectDirs) {
    if (isInside(abs, dir)) {
      const rel = toPosix(relative(dir, abs));
      if (/^\.git(\/|$)/.test(rel) || /(^|\/)node_modules(\/|$)/.test(rel)) return "app";
      return "edit";
    }
  }
  return "outside";
}

export const canRead = (abs: string) => {
  const a = classify(abs);
  return a === "edit" || a === "app";
};
export const canWrite = (abs: string) => classify(abs) === "edit";
