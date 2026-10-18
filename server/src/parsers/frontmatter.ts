import matter from "gray-matter";

// Markdown frontmatter as Claude Code reads it. Strict YAML first; if that fails, plain `key: value` lines,
// because Claude Code accepts values that YAML rejects, such as `argument-hint: [name] [--project | --personal]`.

export interface Frontmatter {
  data: Record<string, any>;
  body: string;
  error: string | null; // set only when the frontmatter can't be read either way
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

function lenient(block: string): Record<string, any> | null {
  const data: Record<string, any> = {};
  let key: string | null = null;
  for (const line of block.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const m = /^([A-Za-z0-9_][\w-]*):\s?(.*)$/.exec(line);
    if (m) {
      key = m[1];
      data[key] = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    } else if (key && /^\s+/.test(line)) {
      // An indented line continues the previous value (a list item or a wrapped string).
      const v = line.trim().replace(/^-\s*/, "");
      data[key] = Array.isArray(data[key]) ? [...data[key], v] : data[key] ? [data[key], v].filter(Boolean) : [v];
    } else {
      return null;
    }
  }
  return data;
}

export function parseFrontmatter(text: string): Frontmatter {
  if (!text.startsWith("---")) return { data: {}, body: text, error: null };
  const fence = FENCE.exec(text);
  if (!fence) return { data: {}, body: text, error: "The frontmatter has no closing --- line." };
  try {
    const m = matter(text, {}); // options object: gray-matter caches by content otherwise
    return { data: m.data ?? {}, body: m.content, error: null };
  } catch (e: any) {
    const data = lenient(fence[1]);
    if (data) return { data, body: text.slice(fence[0].length), error: null };
    return { data: {}, body: text, error: `The frontmatter can't be read: ${e.reason ?? e.message}` };
  }
}
