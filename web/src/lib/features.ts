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
    kinds: ["claude-md", "rule"],
    create: { label: "New instructions", to: "/new", search: { kind: "instructions" } },
    guide: "memory",
  },
  {
    id: "skills",
    label: "Skills",
    short: "Skills",
    icon: Sparkles,
    kinds: ["skill", "command"],
    create: { label: "New skill", to: "/new", search: { kind: "skill" } },
    guide: "skills",
  },
  {
    id: "commands",
    label: "Slash commands",
    short: "Commands",
    icon: Slash,
    kinds: [],
    guide: "commands",
    create: { label: "New command", to: "/new", search: { kind: "command" } },
  },
  {
    id: "agents",
    label: "Agents",
    short: "Agents",
    icon: Bot,
    kinds: ["agent"],
    create: { label: "New agent", to: "/new", search: { kind: "agent" } },
    guide: "agents",
  },
  {
    id: "hooks",
    label: "Hooks",
    short: "Hooks",
    icon: Webhook,
    kinds: ["hook-def", "hook"],
    create: { label: "New hook", to: "/add", search: { what: "hook" } },
    guide: "hooks",
  },
  {
    id: "mcp",
    label: "MCP servers",
    short: "MCP",
    icon: Network,
    kinds: ["mcp"],
    create: { label: "Add server", to: "/add", search: { what: "mcp" } },
    guide: "mcp",
  },
  {
    id: "plugins",
    label: "Plugins",
    short: "Plugins",
    icon: Puzzle,
    kinds: ["plugin"],
    guide: "plugins",
  },
  {
    id: "plans",
    label: "Plans",
    short: "Plans",
    icon: ClipboardList,
    kinds: ["plan"],
    create: { label: "New plan", to: "/sessions/new", search: { mode: "plan" } },
  },
  {
    id: "scheduled",
    label: "Scheduled tasks",
    short: "Scheduled",
    icon: CalendarClock,
    kinds: ["scheduled-task"],
    guide: "scheduled-tasks",
  },
  {
    id: "output-styles",
    label: "Output styles",
    short: "Styles",
    icon: Palette,
    kinds: ["output-style"],
    create: { label: "New style", to: "/new", search: { kind: "output-style" } },
    guide: "output-styles",
  },
  {
    id: "memory",
    label: "Memory",
    short: "Memory",
    icon: Brain,
    kinds: ["memory"],
    create: { label: "New note", to: "/new", search: { kind: "memory" } },
    guide: "memory",
  },
  {
    id: "workflows",
    label: "Workflows",
    short: "Workflows",
    icon: Plug,
    kinds: ["workflow"],
    guide: "dynamic-workflows",
  },
];

export const featureById = (id: string) => FEATURES.find((f) => f.id === id);

/** Which feature page an item belongs on. */
export const featureOfKind = (k: Kind) => FEATURES.find((f) => f.kinds.includes(k));

export const DOCS_ICON = BookText;
