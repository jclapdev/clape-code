// What Claude Code can be customized with, named and described the way its docs do
// (code.claude.com/docs/en/features-overview and /claude-directory). The menu, the Customize page,
// each feature page and Home all read from this list.
import { BookText, Bot, CalendarClock, ClipboardList, Brain, Network, Plug, Puzzle, ScrollText, Slash, Sparkles, Palette, Webhook, type LucideIcon } from "lucide-react";
import type { Kind } from "./types";

export type FeatureId = "instructions" | "skills" | "commands" | "agents" | "hooks" | "mcp" | "plugins" | "plans" | "scheduled" | "output-styles" | "memory" | "workflows";

export interface Feature {
  id: FeatureId;
  label: string;
  short: string; // label under the icon in the narrow menu
  icon: LucideIcon;
  intro: string;
  kinds: Kind[];
  /** What the New button makes, and its label. */
  create?: { label: string; to: "/new" | "/add" | "/sessions/new"; search: Record<string, string> };
  guide?: string; // slug on the Guides page
}

export const FEATURES: Feature[] = [
  {
    id: "instructions",
    label: "Instructions",
    short: "Instructions",
    icon: ScrollText,
    intro: "What Claude reads at the start of every session: your conventions, build commands and \"always do this\" rules. CLAUDE.md covers a whole project; a rule can cover only matching files.",
    kinds: ["claude-md", "rule"],
    create: { label: "New instructions", to: "/new", search: { kind: "instructions" } },
    guide: "memory",
  },
  {
    id: "skills",
    label: "Skills",
    short: "Skills",
    icon: Sparkles,
    intro: "Know-how and step-by-step workflows Claude loads when your request matches, or when you type /name. Use one for anything you'd otherwise paste in a third time.",
    kinds: ["skill", "command"],
    create: { label: "New skill", to: "/new", search: { kind: "skill" } },
    guide: "skills",
  },
  {
    id: "commands",
    label: "Slash commands",
    short: "Commands",
    icon: Slash,
    intro: "Everything you can type after / in a session: Claude Code's built-in commands, your skills and the commands plugins add.",
    kinds: [],
    guide: "commands",
    create: { label: "New command", to: "/new", search: { kind: "command" } },
  },
  {
    id: "agents",
    label: "Agents",
    short: "Agents",
    icon: Bot,
    intro: "Helpers that do one job in their own separate context and hand back a summary, so your main conversation stays short. Good for research, reviews and work in parallel.",
    kinds: ["agent"],
    create: { label: "New agent", to: "/new", search: { kind: "agent" } },
    guide: "agents",
  },
  {
    id: "hooks",
    label: "Hooks",
    short: "Hooks",
    icon: Webhook,
    intro: "A command Claude Code runs every time it reaches an event, such as after each file edit. Instructions are requests; a hook always runs.",
    kinds: ["hook-def", "hook"],
    create: { label: "New hook", to: "/add", search: { what: "hook" } },
    guide: "hooks",
  },
  {
    id: "mcp",
    label: "MCP servers",
    short: "MCP",
    icon: Network,
    intro: "Connections to outside services and tools, such as a database, GitHub, Slack or a browser, so Claude can read from them and act in them.",
    kinds: ["mcp"],
    create: { label: "Add server", to: "/add", search: { what: "mcp" } },
    guide: "mcp",
  },
  {
    id: "plugins",
    label: "Plugins",
    short: "Plugins",
    icon: Puzzle,
    intro: "Ready-made bundles of skills, agents, hooks and MCP servers that you install together from a marketplace, and can share with others.",
    kinds: ["plugin"],
    guide: "plugins",
  },
  {
    id: "plans",
    label: "Plans",
    short: "Plans",
    icon: ClipboardList,
    intro: "The step-by-step plans Claude writes in plan mode before it changes anything, for you to read and approve.",
    kinds: ["plan"],
    create: { label: "New plan", to: "/sessions/new", search: { mode: "plan" } },
  },
  {
    id: "scheduled",
    label: "Scheduled tasks",
    short: "Scheduled",
    icon: CalendarClock,
    intro: "Prompts the Claude desktop app runs for you on a schedule, such as a daily code review. They run while the desktop app is open and your computer is awake.",
    kinds: ["scheduled-task"],
    guide: "scheduled-tasks",
  },
  {
    id: "output-styles",
    label: "Output styles",
    short: "Styles",
    icon: Palette,
    intro: "Set Claude's role, tone and the shape of its answers for a whole session, such as shorter replies or more explanation.",
    kinds: ["output-style"],
    create: { label: "New style", to: "/new", search: { kind: "output-style" } },
    guide: "output-styles",
  },
  {
    id: "memory",
    label: "Memory",
    short: "Memory",
    icon: Brain,
    intro: "Notes Claude writes for itself about each project, such as your preferences and lessons learned, and reads at the start of every session.",
    kinds: ["memory"],
    create: { label: "New note", to: "/new", search: { kind: "memory" } },
    guide: "memory",
  },
  {
    id: "workflows",
    label: "Workflows",
    short: "Workflows",
    icon: Plug,
    intro: "Scripts Claude writes that run many agents in the background and return one result, for jobs too big for a handful of agents.",
    kinds: ["workflow"],
    guide: "dynamic-workflows",
  },
];

export const featureById = (id: string) => FEATURES.find((f) => f.id === id);

/** Which feature page an item belongs on. */
export const featureOfKind = (k: Kind) => FEATURES.find((f) => f.kinds.includes(k));

export const DOCS_ICON = BookText;
