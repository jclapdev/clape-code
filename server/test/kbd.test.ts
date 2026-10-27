// <kbd> in Markdown (BACKLOG #118): shown as a key in both Markdown views, and no other HTML gets through.
import { describe, expect, test } from "bun:test";
import { kbdSpans, remarkKbd } from "../../web/src/lib/kbd";

describe("kbd keys", () => {
  test("the live preview finds each <kbd>…</kbd> and its parts", () => {
    const line = "<kbd>⌘S</kbd> (<kbd>Ctrl S</kbd> on Windows) saves";
    const spans = kbdSpans(line);
    expect(spans.map((s) => line.slice(...s.key))).toEqual(["⌘S", "Ctrl S"]);
    expect(spans.map((s) => line.slice(...s.open) + line.slice(...s.close))).toEqual(["<kbd></kbd>", "<kbd></kbd>"]);
    // Other tags, nested markup and tags across lines are left as typed.
    expect(kbdSpans("<b>x</b> <kbd><b>x</b></kbd> <kbd>a\nb</kbd> <kbd></kbd>")).toEqual([]);
  });

  test("the Markdown view turns html kbd nodes around plain text into a kbd element, and nothing else", () => {
    type N = { type: string; value?: string; children?: N[]; data?: Record<string, unknown> };
    const html = (value: string): N => ({ type: "html", value });
    const text = (value: string): N => ({ type: "text", value });
    const tree: N = {
      type: "root",
      children: [
        { type: "paragraph", children: [html("<kbd>"), text("⌘S"), html("</kbd>"), text(" saves "), html("<script>"), text("x"), html("</script>"), html("<kbd>"), { type: "emphasis", children: [text("y")] }, html("</kbd>")] },
      ],
    };
    remarkKbd()(tree);
    const p = tree.children![0]!.children!;
    expect(p[0]).toEqual({ type: "kbd", children: [text("⌘S")], data: { hName: "kbd" } });
    expect(p.slice(1).map((n) => n.type)).toEqual(["text", "html", "text", "html", "html", "emphasis", "html"]);
  });
});
