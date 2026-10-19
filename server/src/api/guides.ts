// Official guides, fetched from the docs sites so they're always current, and cleaned of the
// site's page components so they read as plain formatted text.
import { Hono } from "hono";
import { WriteError } from "../fs/safeWrite";
import type { Env } from "./env";

export const GUIDES = [
  { slug: "features", title: "What you can customize", about: "When to use instructions, skills, agents, hooks, MCP servers and plugins, and how they fit together.", url: "https://code.claude.com/docs/en/features-overview.md" },
  { slug: "best-practices", title: "Best practices for Claude Code", about: "How to get good results: verify work, plan first, manage context, run sessions in parallel.", url: "https://code.claude.com/docs/en/best-practices.md" },
  { slug: "workflows", title: "Common workflows", about: "Step by step: explore code, fix bugs, refactor, write tests, open pull requests.", url: "https://code.claude.com/docs/en/common-workflows.md" },
  { slug: "sessions", title: "Sessions", about: "Name, resume, branch and find past conversations.", url: "https://code.claude.com/docs/en/sessions.md" },
  { slug: "memory", title: "Instructions and memory", about: "Writing CLAUDE.md files and how Claude's own notes work.", url: "https://code.claude.com/docs/en/memory.md" },
  { slug: "skills", title: "Skills", about: "What skills are, where they live and how Claude picks them.", url: "https://code.claude.com/docs/en/skills.md" },
  { slug: "skill-best-practices", title: "Writing a good skill", about: "What to put in a skill and what to leave out (agentskills.io).", url: "https://agentskills.io/skill-creation/best-practices.md" },
  { slug: "skill-descriptions", title: "Writing a skill's description", about: "How to word a description so Claude uses the skill at the right time (agentskills.io).", url: "https://agentskills.io/skill-creation/optimizing-descriptions.md" },
  { slug: "agents", title: "Agents (subagents)", about: "Creating helpers with their own instructions, tools and model.", url: "https://code.claude.com/docs/en/sub-agents.md" },
  { slug: "output-styles", title: "Output styles", about: "Changing how Claude writes its replies for a whole session.", url: "https://code.claude.com/docs/en/output-styles.md" },
  { slug: "mcp", title: "MCP servers", about: "Connecting Claude to outside tools and services.", url: "https://code.claude.com/docs/en/mcp.md" },
  { slug: "hooks", title: "Hooks", about: "Running your own commands automatically at set moments.", url: "https://code.claude.com/docs/en/hooks-guide.md" },
  { slug: "plugins", title: "Plugins", about: "Installing bundles of skills, agents, hooks and MCP servers, and making your own.", url: "https://code.claude.com/docs/en/plugins/overview.md" },
  { slug: "commands", title: "Slash commands", about: "Every built-in command you can type after /.", url: "https://code.claude.com/docs/en/commands.md" },
  { slug: "scheduled-tasks", title: "Scheduled tasks", about: "Having the desktop app run a prompt for you on a schedule.", url: "https://code.claude.com/docs/en/desktop-scheduled-tasks.md" },
  { slug: "dynamic-workflows", title: "Dynamic workflows", about: "Scripts that run many agents at once and return one result.", url: "https://code.claude.com/docs/en/workflows.md" },
  { slug: "settings", title: "Settings", about: "Which settings file to use and which value wins.", url: "https://code.claude.com/docs/en/settings.md" },
  { slug: "permissions", title: "Permission modes", about: "Plan mode, auto mode and when Claude asks before acting.", url: "https://code.claude.com/docs/en/permission-modes.md" },
];

const cache = new Map<string, { at: number; text: string }>();
const SIX_HOURS = 6 * 3600_000;

/** Turns a docs page's markdown into plain markdown: drops the site's scripts and components, keeps their text. */
export function cleanDoc(md: string): string {
  const out: string[] = [];
  let inExport = false;
  let inFence = false;
  // Text inside a component (<Tabs>, <Tab>, <Steps> …) is indented under its tag. Markdown would read
  // four spaces as a code block, so each component's own indent is taken off, keeping nesting inside it.
  const indents: (number | null)[] = [];
  for (const raw of md.split("\n")) {
    let line = raw;
    const close = /^\s*<\/[A-Z][\w.]*>\s*$/.test(raw);
    const open = !close && /^\s*<[A-Z][\w.]*(\s[^>]*)?>\s*$/.test(raw) && !/\/>\s*$/.test(raw);
    if (close) indents.pop();
    else if (!open && indents.length && raw.trim()) {
      const lead = raw.length - raw.trimStart().length;
      const base = (indents[indents.length - 1] ??= lead);
      line = raw.slice(Math.min(lead, base));
    }
    if (open) indents.push(null);
    const fence = /^```/.test(line.trim());
    if (fence) inFence = !inFence;
    // The closing fence keeps its indent too, or a fence inside a list item never closes.
    if (inFence || fence) {
      out.push(line.replace(/\s+theme=\{null\}/, "").replace(/^(```\w*)\s+.*$/, "$1"));
      continue;
    }
    if (/^export const /.test(line)) inExport = true;
    if (inExport) {
      if (/^\};?\s*$/.test(line)) inExport = false;
      continue;
    }
    if (/^>\s*(## Documentation Index|Fetch the complete documentation index|Use this file to discover)/.test(line)) continue;
    const step = /^\s*<Step title="([^"]+)">/.exec(line);
    if (step) {
      out.push(`#### ${step[1]}`);
      continue;
    }
    const heading = /^\s*<h([1-6])[^>]*>\s*(.*?)\s*(<\/h\1>)?\s*$/.exec(line);
    if (heading) {
      out.push(`${"#".repeat(Number(heading[1]))} ${heading[2]}`.trimEnd());
      continue;
    }
    // Component tags (<Tip>, <Note>, <Card>, <Steps> …) and stray HTML: keep the text inside, drop the tags.
    const stripped = line.replace(/<\/?[A-Za-z][\w.-]*(\s[^>]*)?\/?>/g, "");
    if (!stripped.trim() && line.trim()) continue;
    out.push(stripped.replace(/^ {2,}(?=[^\s-*\d|>])/, ""));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export const guides = new Hono<Env>();

guides.get("/guides", (c) => c.json(GUIDES.map(({ url, ...g }) => ({ ...g, source: new URL(url).hostname }))));

guides.get("/guides/:slug", async (c) => {
  const g = GUIDES.find((x) => x.slug === c.req.param("slug"));
  if (!g) throw new WriteError(404, "There's no guide with that name.");
  const hit = cache.get(g.slug);
  if (hit && Date.now() - hit.at < SIX_HOURS) return c.json({ ...g, text: hit.text });
  try {
    const res = await fetch(g.url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(String(res.status));
    const text = cleanDoc(await res.text());
    cache.set(g.slug, { at: Date.now(), text });
    return c.json({ ...g, text });
  } catch {
    if (hit) return c.json({ ...g, text: hit.text });
    throw new WriteError(502, "The guide couldn't be downloaded. Check your internet connection, or open it in your browser.");
  }
});
