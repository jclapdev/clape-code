// Claude Code's own slash commands, from the "All commands" table of code.claude.com/docs/en/commands.md.
// Each row is `| \`/name <hint>\` | Purpose |`; bundled skills' Purpose starts "**[Skill](...)**." (read 2026-10-27).
import { firstSentence, unlink } from "./settingsReference";

export const COMMANDS_URL = "https://code.claude.com/docs/en/commands.md";

export interface DocCommand {
  /** Without the slash, for example `add-dir`. */
  name: string;
  /** The first sentence of the Purpose cell, without links or code marks. */
  description: string;
  /** The rest of the Command cell, for example `<path>`. */
  argumentHint: string;
  skill: boolean;
}

export interface CommandsReference {
  fetchedAt: string;
  commands: DocCommand[];
}

/** Splits a table row on `|` that isn't escaped as `\|`. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\" && line[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (line[i] === "|") {
      out.push(cur.trim());
      cur = "";
    } else cur += line[i];
  }
  out.push(cur.trim());
  return out.slice(1, -1);
}

const SKILL_MARK = /^\*\*\[Skill\]\([^)]*\)\.?\*\*\.?\s*/;
/** A bold label before the purpose, such as "**Workflow.**" on `/deep-research`. */
const LABEL = /^\*\*[^*]+\*\*\.?\s*/;

export function parseCommandsReference(md: string, fetchedAt = new Date().toISOString()): CommandsReference {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => /^##\s+All commands\s*$/.test(l));
  const commands: DocCommand[] = [];
  if (start < 0) return { fetchedAt, commands };
  for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
    if (!lines[i].startsWith("| `/")) continue;
    const [cmd, purpose = ""] = cells(lines[i]);
    // A cell can name one command in several forms, such as `/design consent`, `/design revoke`.
    const forms = [...cmd.matchAll(/`\/([^`]+)`/g)].map((m) => m[1].trim());
    if (!forms.length) continue;
    const name = forms[0].split(/\s+/)[0];
    const hints = forms.map((f) => f.slice(f.split(/\s+/)[0].length).trim()).filter(Boolean);
    const skill = SKILL_MARK.test(purpose);
    const text = unlink(purpose.replace(LABEL, ""));
    const description = firstSentence(text).replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`/g, "").trim();
    // Rows such as `/vim` "Removed in v2.1.92." name commands that no longer exist.
    if (/^Removed\b/.test(description) || commands.some((c) => c.name === name)) continue;
    commands.push({ name, description, argumentHint: hints.join(" | "), skill });
  }
  return { fetchedAt, commands };
}
