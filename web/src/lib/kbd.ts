// <kbd>⌘S</kbd> in Markdown shows as a key. Only this one tag is understood, with plain text inside; every other
// HTML tag still shows as typed, so a file can't put its own markup or scripts on the page.

/** Each <kbd>…</kbd> in a line of text: where its opening tag, its text and its closing tag start and end. */
export function kbdSpans(text: string): { open: [number, number]; key: [number, number]; close: [number, number] }[] {
  const out: { open: [number, number]; key: [number, number]; close: [number, number] }[] = [];
  for (const m of text.matchAll(/<kbd>([^<>\n]+)<\/kbd>/gi)) {
    const a = m.index;
    const b = a + 5 + m[1]!.length;
    out.push({ open: [a, a + 5], key: [a + 5, b], close: [b, b + 6] });
  }
  return out;
}

type MdNode = { type: string; value?: string; children?: MdNode[]; data?: Record<string, unknown> };
const OPEN = /^<kbd>$/i;
const CLOSE = /^<\/kbd>$/i;

/**
 * A remark plugin: inline `<kbd>` and `</kbd>` around plain text become a kbd element holding that text. The
 * Markdown view doesn't render HTML, so any other tag, or a kbd around anything but text, stays as typed.
 */
export function remarkKbd() {
  const walk = (node: MdNode) => {
    const kids = node.children;
    if (!kids) return;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i]!;
      if (k.type === "html" && OPEN.test(k.value ?? "") && kids[i + 1]?.type === "text" && kids[i + 2]?.type === "html" && CLOSE.test(kids[i + 2]!.value ?? "")) {
        kids.splice(i, 3, { type: "kbd", children: [kids[i + 1]!], data: { hName: "kbd" } });
      } else walk(k);
    }
  };
  return (tree: MdNode) => walk(tree);
}
