// Refreshes the parsed copy of Claude Code's command list that ships with the app, for when the computer is
// offline or the live page can't be fetched. Usage: bun scripts/commands-reference.ts
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { COMMANDS_URL, parseCommandsReference } from "../server/src/parsers/commandsReference";

const res = await fetch(COMMANDS_URL, { signal: AbortSignal.timeout(30000) });
if (!res.ok) throw new Error(`${COMMANDS_URL}: ${res.status}`);
const ref = parseCommandsReference(await res.text());
if (!ref.commands.length) throw new Error("The page had no commands; its layout may have changed.");
const out = join(import.meta.dir, "..", "server", "src", "data", "commands-reference.json");
await writeFile(out, JSON.stringify(ref, null, 2) + "\n");
console.log(`${ref.commands.length} commands (${ref.commands.filter((c) => c.skill).length} skills) written to ${out}`);
