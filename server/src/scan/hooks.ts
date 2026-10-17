import { readFile } from "node:fs/promises";

// Hooks live inside settings files: { hooks: { Event: [ { matcher?, hooks: [ { type, command | prompt, … } ] } ] } }.

export interface HookDef {
  event: string;
  matcher: string | null;
  type: string;
  run: string; // the command, prompt or agent text
  timeout: number | null;
  condition: string | null; // the hook's `if` filter, when present
  file: string;
  line: number; // 1-based line in the settings file where this hook's text appears
}

const lineAt = (text: string, index: number) => (index < 0 ? 1 : text.slice(0, index).split("\n").length);

export async function hooksIn(file: string): Promise<HookDef[]> {
  let text: string;
  let parsed: any;
  try {
    text = await readFile(file, "utf8");
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const out: HookDef[] = [];
  let cursor = text.indexOf('"hooks"');
  for (const [event, groups] of Object.entries<any>(parsed?.hooks ?? {})) {
    if (!Array.isArray(groups)) continue;
    const evAt = text.indexOf(JSON.stringify(event), Math.max(cursor, 0));
    if (evAt >= 0) cursor = evAt;
    for (const g of groups) {
      for (const h of Array.isArray(g?.hooks) ? g.hooks : []) {
        const run = String(h.command ?? h.prompt ?? h.agent ?? h.url ?? "");
        // Find this hook's text after the previous one so repeated commands map to their own lines.
        const at = run ? text.indexOf(JSON.stringify(run).slice(1, -1), cursor) : -1;
        if (at >= 0) cursor = at + 1;
        out.push({
          event,
          matcher: g.matcher ?? null,
          type: String(h.type ?? "command"),
          run,
          timeout: typeof h.timeout === "number" ? h.timeout : null,
          condition: h.if ?? null,
          file,
          line: lineAt(text, at >= 0 ? at : evAt),
        });
      }
    }
  }
  return out;
}
