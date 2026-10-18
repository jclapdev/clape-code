// Live preview for markdown, as in Obsidian: the document is the file's own text, shown formatted.
// Markdown symbols are hidden on every line except the ones the cursor is on, so nothing is
// converted and saving changes only what was typed.
import { syntaxTree } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-lp-bullet";
    s.textContent = "•";
    return s;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly at: number,
  ) {
    super();
  }
  eq(o: CheckboxWidget) {
    return o.checked === this.checked && o.at === this.at;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.className = "cm-lp-check";
    box.setAttribute("aria-label", this.checked ? "Done" : "Not done");
    box.addEventListener("mousedown", (e) => e.preventDefault());
    box.addEventListener("click", (e) => {
      e.preventDefault();
      if (view.state.readOnly) return;
      // Only the one character inside [ ] changes.
      view.dispatch({ changes: { from: this.at + 1, to: this.at + 2, insert: this.checked ? " " : "x" } });
    });
    return box;
  }
  ignoreEvent() {
    return false;
  }
}

const hide = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const line = (cls: string) => Decoration.line({ class: cls });
const mark = (cls: string) => Decoration.mark({ class: cls });

/** Lines the selection touches show their markdown as typed. */
function activeLines(state: EditorState): Set<number> {
  const out = new Set<number>();
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number;
    const b = state.doc.lineAt(r.to).number;
    for (let n = a; n <= b; n++) out.add(n);
  }
  return out;
}

function frontmatterEnd(state: EditorState): number {
  const doc = state.doc;
  if (doc.lines < 2 || doc.line(1).text !== "---") return 0;
  for (let n = 2; n <= Math.min(doc.lines, 200); n++) if (doc.line(n).text === "---") return n;
  return 0;
}

function build(view: EditorView): DecorationSet {
  const { state } = view;
  const active = view.hasFocus ? activeLines(state) : new Set<number>();
  const fmEnd = frontmatterEnd(state);
  type D = { from: number; to: number; deco: Decoration; isLine?: boolean };
  const decos: D[] = [];
  const isActive = (pos: number) => active.has(state.doc.lineAt(pos).number);

  // The header fields at the top read as a quiet box; its --- fences disappear unless you're on them.
  for (let n = 1; n <= fmEnd; n++) {
    const l = state.doc.line(n);
    decos.push({ from: l.from, to: l.from, deco: line(n === 1 ? "cm-lp-front cm-lp-front-first" : n === fmEnd ? "cm-lp-front cm-lp-front-last" : "cm-lp-front"), isLine: true });
    if ((n === 1 || n === fmEnd) && !active.has(n) && l.length) decos.push({ from: l.from, to: l.to, deco: hide });
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;
        if (node.from < (fmEnd ? state.doc.line(fmEnd).to : 0)) return;
        const h = /^ATXHeading(\d)$/.exec(name) ?? /^SetextHeading(\d)$/.exec(name);
        if (h) {
          decos.push({ from: state.doc.lineAt(node.from).from, to: state.doc.lineAt(node.from).from, deco: line(`cm-lp-h cm-lp-h${h[1]}`), isLine: true });
          return;
        }
        switch (name) {
          case "HeaderMark": {
            if (isActive(node.from)) return;
            const next = state.doc.sliceString(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
            decos.push({ from: node.from, to: next, deco: hide });
            return;
          }
          case "EmphasisMark":
          case "StrikethroughMark":
            if (!isActive(node.from)) decos.push({ from: node.from, to: node.to, deco: hide });
            return;
          case "StrongEmphasis":
            decos.push({ from: node.from, to: node.to, deco: mark("cm-lp-strong") });
            return;
          case "Emphasis":
            decos.push({ from: node.from, to: node.to, deco: mark("cm-lp-em") });
            return;
          case "Strikethrough":
            decos.push({ from: node.from, to: node.to, deco: mark("cm-lp-strike") });
            return;
          case "InlineCode":
            decos.push({ from: node.from, to: node.to, deco: mark("cm-lp-code") });
            return;
          case "CodeMark":
            if (isActive(node.from)) return;
            if (node.node.parent?.name === "InlineCode") decos.push({ from: node.from, to: node.to, deco: hide });
            // A code block's ``` lines (and the language after them) disappear; the shaded block shows where it is.
            else if (node.node.parent?.name === "FencedCode") decos.push({ from: node.from, to: state.doc.lineAt(node.from).to, deco: hide });
            return;
          case "FencedCode": {
            const a = state.doc.lineAt(node.from).number;
            const b = state.doc.lineAt(node.to).number;
            for (let n = a; n <= b; n++) {
              const l = state.doc.line(n);
              decos.push({ from: l.from, to: l.from, deco: line(n === a ? "cm-lp-block cm-lp-block-first" : n === b ? "cm-lp-block cm-lp-block-last" : "cm-lp-block"), isLine: true });
            }
            return;
          }
          case "Link": {
            if (isActive(node.from)) {
              decos.push({ from: node.from, to: node.to, deco: mark("cm-lp-link") });
              return false;
            }
            // [text](address): keep the text, styled as a link; hide the brackets and the address.
            const c = node.node.cursor();
            let textEnd = -1;
            if (c.firstChild()) {
              do {
                if (c.name === "LinkMark") {
                  const t = state.doc.sliceString(c.from, c.to);
                  if (t === "[") decos.push({ from: c.from, to: c.to, deco: hide });
                  if (t === "]") {
                    textEnd = c.from;
                    decos.push({ from: c.from, to: node.to, deco: hide });
                    break;
                  }
                }
              } while (c.nextSibling());
            }
            if (textEnd > node.from + 1) decos.push({ from: node.from + 1, to: textEnd, deco: mark("cm-lp-link") });
            return false;
          }
          case "ListMark": {
            const text = state.doc.sliceString(node.from, node.to);
            const task = state.doc.sliceString(node.to, node.to + 4);
            if (isActive(node.from)) return;
            if (/^[-*+]$/.test(text)) {
              // A task item shows only its checkbox; a plain bullet shows a dot.
              if (/^ \[[ xX]\]/.test(task)) decos.push({ from: node.from, to: node.to + 1, deco: hide });
              else decos.push({ from: node.from, to: node.to, deco: bullet });
            }
            return;
          }
          case "TaskMarker": {
            if (isActive(node.from)) return;
            const checked = /x/i.test(state.doc.sliceString(node.from, node.to));
            decos.push({ from: node.from, to: node.to, deco: Decoration.replace({ widget: new CheckboxWidget(checked, node.from) }) });
            return;
          }
          case "QuoteMark":
            decos.push({ from: state.doc.lineAt(node.from).from, to: state.doc.lineAt(node.from).from, deco: line("cm-lp-quote"), isLine: true });
            if (!isActive(node.from)) {
              const next = state.doc.sliceString(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
              decos.push({ from: node.from, to: next, deco: hide });
            }
            return;
          case "HorizontalRule":
            decos.push({ from: state.doc.lineAt(node.from).from, to: state.doc.lineAt(node.from).from, deco: line("cm-lp-hr"), isLine: true });
            if (!isActive(node.from)) decos.push({ from: node.from, to: node.to, deco: hide });
            return;
          case "Table":
            for (let n = state.doc.lineAt(node.from).number; n <= state.doc.lineAt(node.to).number; n++) {
              const l = state.doc.line(n);
              decos.push({ from: l.from, to: l.from, deco: line("cm-lp-table"), isLine: true });
            }
            return;
        }
      },
    });
  }

  // Replacements must not overlap; the rest CodeMirror sorts itself.
  decos.sort((a, b) => a.from - b.from || a.to - b.to);
  let hiddenTo = -1;
  const kept = decos.filter((d) => {
    if (d.deco.spec.widget === undefined && d.deco !== hide) return true;
    if (d.from < hiddenTo) return false;
    hiddenTo = d.to;
    return true;
  });
  return Decoration.set(
    kept.map((d) => d.deco.range(d.from, d.to)),
    true,
  );
}

const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged) this.decorations = build(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

const theme = EditorView.theme({
  ".cm-content": { fontFamily: "var(--font-sans)", fontSize: "14.5px", maxWidth: "80ch", padding: "16px 20px" },
  ".cm-line": { padding: "1px 0" },
  ".cm-lp-h": { fontWeight: "600", lineHeight: "1.35" },
  ".cm-lp-h1": { fontSize: "1.55em", paddingTop: "0.5em" },
  ".cm-lp-h2": { fontSize: "1.3em", paddingTop: "0.45em" },
  ".cm-lp-h3": { fontSize: "1.12em", paddingTop: "0.35em" },
  ".cm-lp-strong": { fontWeight: "600" },
  ".cm-lp-em": { fontStyle: "italic" },
  ".cm-lp-strike": { textDecoration: "line-through", color: "var(--muted-foreground)" },
  ".cm-lp-code": { fontFamily: "var(--font-mono)", fontSize: "0.9em", background: "var(--sunken)", borderRadius: "4px", padding: "0.1em 0.25em" },
  ".cm-lp-block": { fontFamily: "var(--font-mono)", fontSize: "13px", background: "var(--sunken)", padding: "0 12px !important" },
  ".cm-lp-block-first": { borderTopLeftRadius: "6px", borderTopRightRadius: "6px", paddingTop: "6px !important" },
  ".cm-lp-block-last": { borderBottomLeftRadius: "6px", borderBottomRightRadius: "6px", paddingBottom: "6px !important" },
  ".cm-lp-link": { color: "var(--primary)", textDecoration: "underline", textUnderlineOffset: "2px" },
  ".cm-lp-bullet": { color: "var(--muted-foreground)", padding: "0 0.15em" },
  ".cm-lp-check": { margin: "0 0.35em 0 0", verticalAlign: "-2px", cursor: "pointer", accentColor: "var(--primary)" },
  ".cm-lp-quote": { borderLeft: "3px solid var(--line-strong)", paddingLeft: "12px !important", color: "var(--ink-2)" },
  ".cm-lp-hr": { borderBottom: "1px solid var(--line-strong)", lineHeight: "0.6" },
  ".cm-lp-table": { fontFamily: "var(--font-mono)", fontSize: "13px" },
  ".cm-lp-front": { background: "var(--sunken)", fontSize: "13px", color: "var(--ink-2)", padding: "0 12px !important" },
  ".cm-lp-front-first": { borderTopLeftRadius: "6px", borderTopRightRadius: "6px", paddingTop: "6px !important" },
  ".cm-lp-front-last": { borderBottomLeftRadius: "6px", borderBottomRightRadius: "6px", paddingBottom: "6px !important", marginBottom: "10px" },
});

export const livePreview = (): Extension => [plugin, theme];
