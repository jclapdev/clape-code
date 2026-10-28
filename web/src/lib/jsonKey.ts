// Where a dotted settings key such as `sandbox.network.allowedDomains` sits in a JSON file's text.

/**
 * The 1-based line of the key's last part, each part looked for as a key one level inside the part before it;
 * undefined when it isn't there or the text isn't JSON.
 */
export function lineOfKey(text: string, key: string): number | undefined {
  const parts = key.split(".");
  let found = 0; // parts matched so far
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth < found) return undefined; // the object holding the next part closed without it
    } else if (c === '"') {
      const start = i;
      let s = "";
      for (i++; i < text.length && text[i] !== '"'; i++) s += text[i] === "\\" ? text[++i] : text[i];
      let j = i + 1;
      while (/\s/.test(text[j] ?? "")) j++;
      if (text[j] === ":" && depth === found + 1 && s === parts[found]) {
        found++;
        if (found === parts.length) return text.slice(0, start).split("\n").length;
      }
    }
  }
  return undefined;
}
