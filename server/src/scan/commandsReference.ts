// Claude Code's own slash commands: the docs' "All commands" table (fetched live, kept in the app folder, with
// the copy shipped by scripts/commands-reference.ts for offline), plus any the last session reported that the
// docs don't list yet.
import { COMMANDS_URL, parseCommandsReference, type CommandsReference } from "../parsers/commandsReference";
import shipped from "../data/commands-reference.json";
import { knownCommands } from "../live/sessions";
import { docsCache } from "./docsCache";

const cache = docsCache<CommandsReference>({
  url: COMMANDS_URL,
  file: "commands-reference.json",
  parse: parseCommandsReference,
  usable: (r) => Array.isArray(r?.commands) && r.commands.length > 0,
  shipped: shipped as CommandsReference,
});

export const commandsCachePath = cache.path;
export const resetCommandsReference = cache.reset;
export const commandsReference = cache.get;

export interface BuiltInCommand {
  name: string;
  description: string;
  argumentHint: string;
  /** "Built into Claude Code", "Built-in skill" or "From MCP server <server>". */
  tag: string;
}

export const BUILT_IN = "Built into Claude Code";

/**
 * The MCP server a reported command comes from. The docs (mcp.md, "Execute MCP prompts"): "Claude Code lists
 * each MCP prompt as `/servername:promptname (MCP)`. Typing `/mcp__servername__promptname` also runs it."
 */
export function mcpServerOf(c: { name: string; description: string }): { server: string; name: string } | null {
  const underscored = /^mcp__(.+?)__(.+)$/.exec(c.name);
  if (underscored) return { server: underscored[1], name: c.name };
  const name = c.name.replace(/\s*\(MCP\)$/, "");
  const colon = name.indexOf(":");
  if (colon > 0 && (name !== c.name || /\(MCP\)\s*$/.test(c.description))) return { server: name.slice(0, colon), name };
  return null;
}

/** The docs' commands, then the last session's that the docs don't list. Names starting `__` are internal and left out. */
export function mergeCommands(docs: CommandsReference["commands"], reported: { name: string; description: string; argumentHint: string }[]): BuiltInCommand[] {
  const out = new Map<string, BuiltInCommand>();
  for (const d of docs) out.set(d.name, { name: d.name, description: d.description, argumentHint: d.argumentHint, tag: d.skill ? "Built-in skill" : BUILT_IN });
  for (const r of reported) {
    if (r.name.startsWith("__")) continue;
    const mcp = mcpServerOf(r);
    const name = mcp?.name ?? r.name;
    const had = out.get(name);
    if (had) {
      if (!had.argumentHint && r.argumentHint) had.argumentHint = r.argumentHint;
      continue;
    }
    out.set(name, { name, description: r.description ?? "", argumentHint: r.argumentHint ?? "", tag: mcp ? `From MCP server ${mcp.server}` : BUILT_IN });
  }
  return [...out.values()];
}

export async function builtInCommands(): Promise<BuiltInCommand[]> {
  const [{ ref }, reported] = await Promise.all([commandsReference(), knownCommands()]);
  return mergeCommands(ref.commands, reported);
}
