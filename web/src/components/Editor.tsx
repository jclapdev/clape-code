import { json } from "@codemirror/lang-json";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { yaml, yamlFrontmatter } from "@codemirror/lang-yaml";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { MergeView } from "@codemirror/merge";
import { tags as t } from "@lezer/highlight";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import CodeMirror, { basicSetup } from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef, useState } from "react";
import { livePreview } from "./livePreview";

export function languageFor(path: string): Extension[] {
  const p = path.toLowerCase();
  if (p.endsWith(".json") || p.endsWith(".jsonl")) return [json()];
  // Frontmatter is parsed as YAML; otherwise its closing --- turns the line above into a markdown heading.
  if (p.endsWith(".md") || p.endsWith(".mdx")) return [yamlFrontmatter({ content: markdown() })];
  if (p.endsWith(".yaml") || p.endsWith(".yml")) return [yaml()];
  if (p.endsWith(".py")) return [python()];
  return [];
}

// One theme for both modes: every colour comes from the app's CSS variables.
export const ccTheme = EditorView.theme({
  "&": { backgroundColor: "var(--surface)", color: "var(--ink)", fontSize: "13px", height: "100%" },
  ".cm-content": { fontFamily: "var(--font-mono)", caretColor: "var(--primary)", padding: "10px 0" },
  ".cm-gutters": { backgroundColor: "var(--surface)", color: "var(--faint)", border: "none" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--accent) 45%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--ink-2)" },
  "&.cm-focused": { outline: "none" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "var(--accent) !important" },
  ".cm-cursor": { borderLeftColor: "var(--primary)" },
  ".cm-scroller": { lineHeight: "1.6" },
  ".cm-panels": { backgroundColor: "var(--panel)", color: "var(--ink)", borderColor: "var(--line)" },
  ".cm-searchMatch": { backgroundColor: "var(--attn-soft)", outline: "1px solid var(--attn-line)" },
  ".cm-selectionMatch": { backgroundColor: "color-mix(in srgb, var(--accent) 80%, transparent)" },
  ".cm-tooltip": { backgroundColor: "var(--surface)", border: "1px solid var(--line)" },
  ".cm-changedLine": { backgroundColor: "color-mix(in srgb, var(--ok-soft) 70%, transparent) !important" },
  ".cm-deletedChunk": { backgroundColor: "var(--danger-soft) !important" },
  ".cm-changedText": { background: "color-mix(in srgb, var(--ok-dot) 30%, transparent) !important" },
  ".cm-deletedText": { background: "color-mix(in srgb, var(--danger) 25%, transparent) !important" },
});

const ccHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [t.heading1, t.heading2, t.heading3, t.heading4, t.heading], fontWeight: "600", color: "var(--ink)" },
    { tag: [t.strong], fontWeight: "600" },
    { tag: [t.emphasis], fontStyle: "italic" },
    { tag: [t.link, t.url], color: "var(--primary)" },
    { tag: [t.monospace], color: "var(--ink-2)" },
    { tag: [t.keyword, t.atom, t.bool], color: "var(--primary-strong)" },
    { tag: [t.string, t.special(t.string)], color: "var(--ok)" },
    { tag: [t.number], color: "var(--attn)" },
    { tag: [t.propertyName, t.definition(t.propertyName)], color: "var(--primary)" },
    { tag: [t.comment, t.meta, t.processingInstruction, t.contentSeparator], color: "var(--faint)" },
    { tag: [t.list, t.quote], color: "var(--ink-2)" },
  ]),
);

export function Editor({ value, onChange, path, readOnly, onSave, line, preview }: { value: string; onChange: (v: string) => void; path: string; readOnly?: boolean; onSave?: () => void; line?: number; preview?: boolean }) {
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const extensions = useMemo(
    () => [
      ...(preview ? [yamlFrontmatter({ content: markdown({ base: markdownLanguage }) }), livePreview()] : languageFor(path)),
      ccTheme,
      ccHighlight,
      EditorView.lineWrapping,
      keymap.of([{ key: "Mod-s", preventDefault: true, run: () => (saveRef.current?.(), true) }]),
    ],
    [path, preview],
  );
  const [view, setView] = useState<EditorView | null>(null);
  const jumped = useRef<string | null>(null);
  // Put the cursor on `line` once the editor exists and the document has loaded (opens a settings file at one hook).
  useEffect(() => {
    const key = `${path}:${line}`;
    if (!view || !line || !value || view.state.doc.length === 0 || jumped.current === key) return;
    const n = Math.min(Math.max(1, line), view.state.doc.lines);
    const at = view.state.doc.line(n);
    view.dispatch({ selection: { anchor: at.from, head: at.to }, effects: EditorView.scrollIntoView(at.from, { y: "center" }) });
    jumped.current = key;
  }, [view, line, path, value]);
  return (
    <CodeMirror
      onCreateEditor={setView}
      value={value}
      onChange={onChange}
      extensions={extensions}
      editable={!readOnly}
      readOnly={readOnly}
      theme="none"
      height="100%"
      className="h-full"
      basicSetup={{ foldGutter: false, highlightActiveLine: !readOnly && !preview, autocompletion: false, lineNumbers: !preview, highlightActiveLineGutter: !preview }}
      aria-label={`Contents of ${path}`}
    />
  );
}

/** Side-by-side diff of two versions, read-only. */
export function DiffView({ before, after, path }: { before: string; after: string; path: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const common = [basicSetup({ foldGutter: false, highlightActiveLine: false }), ...languageFor(path), ccTheme, ccHighlight, EditorView.lineWrapping, EditorState.readOnly.of(true), EditorView.editable.of(false)];
    const view = new MergeView({
      a: { doc: before, extensions: common },
      b: { doc: after, extensions: common },
      parent: host.current,
      collapseUnchanged: { margin: 3, minSize: 6 },
      highlightChanges: true,
      gutter: true,
    });
    return () => view.destroy();
  }, [before, after, path]);
  return (
    <div>
      <div className="mb-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <span>On disk</span>
        <span>Your version</span>
      </div>
      <div ref={host} className="overflow-hidden rounded-md border border-line [&_.cm-mergeView]:max-h-[60vh]" />
    </div>
  );
}
