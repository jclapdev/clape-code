// Lines that each keep their own ending, so joining them gives back the exact bytes,
// even in a file that mixes Windows and Unix line endings.

export interface Seg {
  text: string;
  eol: "" | "\n" | "\r\n"; // the last segment has none
}

export function toSegs(src: string): Seg[] {
  const parts = src.split("\n");
  return parts.map((p, i) => {
    if (i === parts.length - 1) return { text: p, eol: "" };
    return p.endsWith("\r") ? { text: p.slice(0, -1), eol: "\r\n" } : { text: p, eol: "\n" };
  });
}

export const fromSegs = (segs: Seg[]) => segs.map((s) => s.text + s.eol).join("");

/** The ending most lines use, for lines the app adds. */
export function mainEol(segs: Seg[]): "\n" | "\r\n" {
  const crlf = segs.filter((s) => s.eol === "\r\n").length;
  const lf = segs.filter((s) => s.eol === "\n").length;
  return crlf > lf ? "\r\n" : "\n";
}

/** Insert new lines before index `at`. Inserting after the very last line gives that line an ending first. */
export function insertLines(segs: Seg[], at: number, texts: string[]) {
  const eol = mainEol(segs);
  if (!texts.length) return;
  if (at >= segs.length) {
    const last = segs[segs.length - 1];
    if (last && last.eol === "") last.eol = eol;
    segs.push(...texts.map((t, i) => ({ text: t, eol: i === texts.length - 1 ? ("" as const) : eol })));
    return;
  }
  segs.splice(at, 0, ...texts.map((t) => ({ text: t, eol })));
}
