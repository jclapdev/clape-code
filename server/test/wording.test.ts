// Titles in the app name what a section holds, the way any web app does ("Recent changes", not "What changed").
// This reads every title in web/src and fails on the patterns that have crept in before.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const WEB = join(import.meta.dir, "..", "..", "web", "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "ui" ? [] : files(p); // ui/ holds the component kit, not app text
    return /\.tsx?$/.test(n) ? [p] : [];
  });
}

/** Every title-like string: headings, title props, `title:` fields, and Section/Card/EmptyState titles. */
export function titles(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  const patterns = [/<h[1-4][^>]*>([^<{]+)</g, /\btitle="([^"]+)"/g, /\btitle: "([^"]+)"/g];
  for (const f of files(WEB)) {
    const src = readFileSync(f, "utf8");
    for (const re of patterns)
      for (const m of src.matchAll(re)) {
        const text = m[1]!.trim();
        // Icon tooltips such as title="Light" on the theme switch are labels, not titles; they pass the same rules anyway.
        if (text) out.push({ where: `${relative(WEB, f)}:${src.slice(0, m.index).split("\n").length}`, text });
      }
  }
  return out;
}

const PHRASE_START = /^(what|how|why|where|when|who|which|nothing|your|can|did|does|do|is|are|let's|here's|this is)\b/i;
const FILE_NAME = /\b[\w-]+\.(md|json|jsonl|ts|tsx|py|sh|ya?ml)\b/i;
const INSIDER = /\b(frontmatter|jsonl|raw json|unnamed job|jobs?|library|scope: global|subagent runs?)\b/i;

describe("wording", () => {
  const all = titles();

  test("finds the app's titles", () => {
    expect(all.length).toBeGreaterThan(40);
  });

  test("titles name what a section holds, not a phrase or a question", () => {
    // A confirmation dialog may ask, as every platform's dialogs do: "Delete this file?"
    const confirm = /^(turn|delete|remove|discard|replace|archive|restore|stop|leave|move|sign out)\b.*\?$/i;
    expect(all.filter((t) => PHRASE_START.test(t.text) || (t.text.endsWith("?") && !confirm.test(t.text)))).toEqual([]);
  });

  test("titles don't show file names", () => {
    // CLAUDE.md is the feature's own name, the word users know it by.
    expect(all.filter((t) => FILE_NAME.test(t.text.replace(/\bCLAUDE\.md\b/g, "")))).toEqual([]);
  });

  test("no screen text calls a background session a job", () => {
    const hits = files(WEB).flatMap((f) => {
      const src = readFileSync(f, "utf8");
      return [...src.matchAll(/["'>`]([^"'<`]*\b(?:background job|unnamed job)s?\b[^"'<`]*)/gi)].map((m) => `${relative(WEB, f)}: ${m[1]}`);
    });
    expect(hits).toEqual([]);
  });

  test("titles don't use words only Claude Code insiders know", () => {
    expect(all.filter((t) => INSIDER.test(t.text))).toEqual([]);
  });

  test("no page puts a sentence under its heading to explain it", () => {
    // A heading's sub line may show data (a path, an account), never a written sentence; feature and form intros are gone too.
    const hits = files(WEB).flatMap((f) => {
      const src = readFileSync(f, "utf8");
      return [...src.matchAll(/\bsub="([^"]*)"|\bintro: "([^"]*)"|\{(?:f|spec)\.intro\}/g)].map((m) => `${relative(WEB, f)}: ${m[0]}`);
    });
    expect(hits).toEqual([]);
  });

  test("App preferences only lists shortcuts and features that exist", () => {
    const src = readFileSync(join(WEB, "pages", "Preferences.tsx"), "utf8");
    for (const gone of ['"K"', '["["]', '["]"]', '"g", "h"', "Drag a divider", "Save as feedback", "search box", "Pane sizes", "FeedbackFile"]) expect(src).not.toContain(gone);
    // The one shortcut it lists, Save, is bound in the editor.
    expect(readFileSync(join(WEB, "components", "Editor.tsx"), "utf8")).toContain('key: "Mod-s"');
  });
});
