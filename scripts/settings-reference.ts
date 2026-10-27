// Refreshes the parsed copy of Claude Code's settings reference that ships with the app, for when
// the computer is offline or the live page can't be fetched. Usage: bun scripts/settings-reference.ts
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseSettingsReference, REFERENCE_URL } from "../server/src/parsers/settingsReference";

const res = await fetch(REFERENCE_URL, { signal: AbortSignal.timeout(30000) });
if (!res.ok) throw new Error(`${REFERENCE_URL}: ${res.status}`);
const ref = parseSettingsReference(await res.text());
if (!ref.topics.length) throw new Error("The page had no settings; its layout may have changed.");
const out = join(import.meta.dir, "..", "server", "src", "data", "settings-reference.json");
await writeFile(out, JSON.stringify(ref, null, 2) + "\n");
console.log(`${ref.topics.length} topics, ${ref.topics.reduce((n, t) => n + t.settings.length, 0)} settings written to ${out}`);
