// Claude Code's settings reference (code.claude.com/docs/en/settings-reference.md) as topics and settings.
// Each setting is a `### \`key\`` heading under a `## Topic`, a description, then `* **Scope**:`,
// `* **Type**:` and `* **Default**:` lines (read 2026-10-27).

export const REFERENCE_URL = "https://code.claude.com/docs/en/settings-reference.md";

/** Topics that aren't settings people change here: the index, organization-only and ~/.claude.json keys, links. */
const LEFT_OUT_TOPICS = new Set(["Settings index", "Enterprise and managed settings", "Global config settings", "See also"]);
/** Scopes only an organization or Claude Code itself writes (BRIEF.md won't-do; spec 005 out of scope). */
const LEFT_OUT_SCOPES = new Set(["Managed", "Global config"]);

/** Settings an existing Settings section already edits, by that section's id on the page. */
const SECTION_OF: [RegExp, string][] = [
  [/^permissions(\.|$)/, "permissions"],
  [/^model$/, "model"],
  [/^env$/, "env"],
  [/^statusLine(\.|$)/, "status-line"],
  [/^sandbox(\.|$)/, "sandbox"],
  [/^theme$/, "themes"],
];

export type SettingType = "boolean" | "choice" | "number" | "string" | "list" | "other";

export interface ReferenceSetting {
  key: string;
  description: string;
  type: SettingType;
  /** The `* **Type**:` text with links reduced to their text. */
  typeText: string;
  /** For "string, one of:", the listed values. */
  choices?: string[];
  default: string | null;
  scope: string;
  /** The existing Settings section that edits this setting, if one does. */
  section?: string;
}

export interface ReferenceTopic {
  id: string;
  title: string;
  settings: ReferenceSetting[];
}

export interface SettingsReference {
  fetchedAt: string;
  topics: ReferenceTopic[];
}

/** `[text](url)` becomes `text`. */
export const unlink = (s: string) => s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");

/**
 * The first sentence: up to the first `.`, `!` or `?` outside code spans that ends the text or comes before a space.
 * A code span opens with a run of backticks and closes at the next run of the same length (CommonMark), so
 * `` !`...` `` is one span.
 */
export function firstSentence(text: string): string {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "`") {
      let n = 1;
      while (text[i + n] === "`") n++;
      const fence = "`".repeat(n);
      // The closing run must be exactly n backticks long.
      let j = i + n;
      let close = -1;
      while ((j = text.indexOf(fence, j)) >= 0) {
        let m = n;
        while (text[j + m] === "`") m++;
        if (m === n) {
          close = j;
          break;
        }
        j += m;
      }
      i = close >= 0 ? close + n - 1 : i + n - 1; // with no closing run, the backticks are plain text
    } else if (".!?".includes(ch) && (i === text.length - 1 || /\s/.test(text[i + 1])) && !/\b(e\.g|i\.e|etc|vs)$/.test(text.slice(0, i))) return text.slice(0, i + 1);
  }
  return text;
}

/** `**bold**`, `__bold__`, `*italic*` and `_italic_` become their text; code spans are left as they are. */
export const unemphasize = (s: string) =>
  s
    .split(/(`+[^`]*`+)/)
    .map((part, i) =>
      i % 2 ? part : part.replace(/(\*\*|__)(\S(?:.*?\S)?)\1/g, "$2").replace(/(^|[^\w*])([*_])(\S(?:.*?\S)?)\2(?![\w*])/g, "$1$3"),
    )
    .join("");

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function typeOf(typeText: string, choices: string[]): SettingType {
  if (/^Boolean\b/.test(typeText)) return "boolean";
  if (choices.length) return "choice";
  if (/^(number|integer)\b/.test(typeText)) return "number";
  if (/^array of\b/.test(typeText) && !/object/.test(typeText)) return "list";
  if (/^string\b/.test(typeText) && !/\barray\b/.test(typeText)) return "string";
  return "other";
}

export function parseSettingsReference(md: string, fetchedAt = new Date().toISOString()): SettingsReference {
  const topics: ReferenceTopic[] = [];
  let topic: ReferenceTopic | null = null;
  let cur: { key: string; para: string[]; callout: string[]; paraDone: boolean; scope?: string; typeText?: string; choices: string[]; inChoices: boolean; default: string | null } | null = null;
  let inFence = false;

  const finish = () => {
    if (!cur || !topic) return;
    const c = cur;
    cur = null;
    // An entry with no Type or Scope line (such as a removed setting) isn't listed.
    if (c.typeText === undefined || c.scope === undefined || LEFT_OUT_SCOPES.has(c.scope)) return;
    const s: ReferenceSetting = {
      key: c.key,
      // A setting with only a callout (such as a deprecation warning) is described by the callout's text.
      description: firstSentence(unemphasize(unlink((c.para.length ? c.para : c.callout).join(" "))).replace(/\s+/g, " ").trim()),
      type: typeOf(c.typeText, c.choices),
      typeText: c.typeText,
      default: c.default,
      scope: c.scope,
    };
    if (c.choices.length) s.choices = c.choices;
    const section = SECTION_OF.find(([re]) => re.test(c.key))?.[1];
    if (section) s.section = section;
    topic.settings.push(s);
  };

  for (const line of md.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      if (cur && cur.para.length) cur.paraDone = true;
      continue;
    }
    if (inFence) continue;
    const h2 = /^## (.+?)\s*$/.exec(line);
    if (h2) {
      finish();
      topic = LEFT_OUT_TOPICS.has(h2[1]) ? null : { id: slug(h2[1]), title: h2[1], settings: [] };
      if (topic) topics.push(topic);
      continue;
    }
    const h3 = /^### `([^`]+)`\s*$/.exec(line);
    if (h3) {
      finish();
      cur = topic ? { key: h3[1], para: [], callout: [], paraDone: false, choices: [], inChoices: false, default: null } : null;
      continue;
    }
    if (/^#{1,3} /.test(line)) {
      finish();
      continue;
    }
    if (!cur) continue;
    const field = /^\* \*\*(Scope|Type|Default)\*\*:\s*(.*)$/.exec(line);
    if (field) {
      cur.paraDone = true;
      cur.inChoices = false;
      if (field[1] === "Scope") cur.scope = /^\[`([^`]+)`\]/.exec(field[2])?.[1] ?? /^`([^`]+)`/.exec(field[2])?.[1] ?? unlink(field[2]).trim();
      else if (field[1] === "Default") cur.default = unlink(field[2]).trim();
      else {
        cur.typeText = unlink(field[2]).trim();
        cur.inChoices = /^string, one of:$/.test(cur.typeText);
      }
      continue;
    }
    if (/^\* \*\*/.test(line)) {
      cur.paraDone = true;
      cur.inChoices = false;
      continue;
    }
    if (cur.inChoices) {
      const choice = /^\s+\* `"([^"]*)"`/.exec(line);
      if (choice) cur.choices.push(choice[1]);
      continue;
    }
    if (cur.paraDone) continue;
    // The description is the first paragraph after the heading; tags such as <Note> aren't part of it.
    if (!line.trim()) {
      if (cur.para.length) cur.paraDone = true;
      continue;
    }
    if (/^\s*<\/?[A-Za-z]/.test(line) && !cur.para.length) continue;
    // A callout (`> [!WARNING]` and the quoted lines under it) before the description isn't part of it.
    if (/^\s*>/.test(line) && !cur.para.length) {
      const text = line.replace(/^\s*>\s?/, "").replace(/^\[![A-Za-z]+\]\s*/, "").trim();
      if (text) cur.callout.push(text);
      continue;
    }
    cur.para.push(line.trim());
  }
  finish();
  // A topic whose settings are all organization-only (such as "Tools") has nothing to show.
  return { fetchedAt, topics: topics.filter((t) => t.settings.length) };
}
