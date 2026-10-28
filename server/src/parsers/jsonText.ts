// Sets or removes one dotted key in a JSON file's text, leaving every line it doesn't touch byte-for-byte the same.
// A new key goes before the object's first key, so no other line gains a comma.
import { WriteError } from "../fs/safeWrite";

interface Member {
  key: string;
  keyStart: number;
  valStart: number;
  valEnd: number;
  node: Node;
}
interface Node {
  start: number;
  end: number;
  members?: Member[]; // set for objects only
}

/** Offsets of every value in valid JSON text; objects keep their members. */
function parse(text: string): Node {
  let i = 0;
  const ws = () => {
    while (/\s/.test(text[i] ?? "")) i++;
  };
  const str = (): string => {
    const start = i;
    for (i++; text[i] !== '"'; i++) if (text[i] === "\\") i++;
    i++;
    return JSON.parse(text.slice(start, i));
  };
  const value = (): Node => {
    ws();
    const start = i;
    const c = text[i];
    if (c === "{") {
      const members: Member[] = [];
      i++;
      ws();
      if (text[i] === "}") return { start, end: ++i, members };
      for (;;) {
        ws();
        const keyStart = i;
        const key = str();
        ws();
        i++; // :
        ws();
        const valStart = i;
        const node = value();
        members.push({ key, keyStart, valStart, valEnd: node.end, node });
        ws();
        if (text[i++] === "}") return { start, end: i, members };
      }
    }
    if (c === "[") {
      i++;
      ws();
      if (text[i] === "]") return { start, end: ++i };
      for (;;) {
        value();
        ws();
        if (text[i++] === "]") return { start, end: i };
      }
    }
    if (c === '"') {
      str();
      return { start, end: i };
    }
    while (i < text.length && !/[\s,}\]]/.test(text[i])) i++;
    return { start, end: i };
  };
  return value();
}

const lineStart = (text: string, at: number) => text.lastIndexOf("\n", at - 1) + 1;
/** The spaces or tabs a line starts with. */
const indentOf = (text: string, at: number) => /^[ \t]*/.exec(text.slice(lineStart(text, at)))![0];

/** `value` as JSON, its later lines indented to sit under a key indented by `indent`. */
const render = (value: unknown, unit: string, indent: string) => JSON.stringify(value, null, unit).replace(/\n/g, `\n${indent}`);

/** `{ "a": { "b": v } }` for parts ["a", "b"]. */
const nest = (parts: string[], value: unknown): unknown => parts.reduceRight<unknown>((v, p) => ({ [p]: v }), value);

/**
 * The text with `key` (dotted parts are nested objects) set to `value`, or removed when `value` is undefined.
 * Removing the last key of a nested object removes that object too.
 */
export function setKeyInText(text: string, key: string, value: unknown): string {
  const parts = key.split(".");
  const unit = text.match(/^\{\s*\n([ \t]+)/)?.[1] ?? "  ";
  if (!text.trim()) return value === undefined ? text : JSON.stringify(nest(parts, value), null, unit) + "\n";
  const root = parse(text);
  if (!root.members) throw new WriteError(400, "This settings file isn't a JSON object. Fix it as text first.");
  const splice = (from: number, to: number, put: string) => text.slice(0, from) + put + text.slice(to);

  // Walk down to the deepest object on the path that exists.
  const chain: { obj: Node; member?: Member }[] = [{ obj: root }];
  let obj = root;
  let depth = 0;
  for (; depth < parts.length; depth++) {
    const m = obj.members!.find((x) => x.key === parts[depth]);
    if (!m) break;
    if (depth === parts.length - 1) {
      chain[chain.length - 1].member = m;
      break;
    }
    if (!m.node.members) throw new WriteError(400, `${parts.slice(0, depth + 1).join(".")} isn't an object in this file. Fix it as text first.`);
    chain[chain.length - 1].member = m;
    obj = m.node;
    chain.push({ obj });
  }
  const last = chain[chain.length - 1];

  if (value === undefined) {
    if (depth < parts.length - 1 || !last.member) return text; // not there
    // Remove from the innermost object that would still have something left, so no `{}` stays behind.
    let k = chain.length - 1;
    while (k > 0 && chain[k].obj.members!.length === 1) k--;
    const { obj: o, member: m } = chain[k];
    const members = o.members!;
    if (members.length === 1) return splice(o.start, o.end, "{}"); // the root itself is left empty
    const at = members.indexOf(m!);
    if (at < members.length - 1) {
      const next = members[at + 1];
      // `"m": v,\n    "next"` → `"next"`: the removed key's own lines go, every other line stays.
      const from = text.slice(lineStart(text, m!.keyStart), m!.keyStart).trim() === "" && lineStart(text, m!.keyStart) < lineStart(text, next.keyStart) ? lineStart(text, m!.keyStart) : m!.keyStart;
      const to = from === m!.keyStart ? next.keyStart : lineStart(text, next.keyStart);
      return splice(from, to, "");
    }
    return splice(members[at - 1].valEnd, m!.valEnd, ""); // the last key: the comma before it goes too
  }

  if (last.member && depth === parts.length - 1) {
    const m = last.member;
    return splice(m.valStart, m.valEnd, render(value, unit, indentOf(text, m.keyStart)));
  }
  // Add what's missing under the deepest object that exists.
  const rest = parts.slice(depth);
  const add = nest(rest.slice(1), value);
  const members = obj.members!;
  if (members.length) {
    const first = members[0];
    const ownLine = text.slice(obj.start + 1, first.keyStart).includes("\n");
    const indent = indentOf(text, first.keyStart);
    const entry = `${JSON.stringify(rest[0])}: ${render(add, unit, indent)}`;
    return splice(first.keyStart, first.keyStart, ownLine ? `${entry},\n${indent}` : `${entry}, `);
  }
  const outer = indentOf(text, obj.start);
  const inner = outer + unit;
  return splice(obj.start, obj.end, `{\n${inner}${JSON.stringify(rest[0])}: ${render(add, unit, inner)}\n${outer}}`);
}
