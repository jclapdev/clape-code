// Every documented setting, one section per topic of Claude Code's settings reference (spec 005), with its value now.
import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Section } from "./Projects";

type Source = "managed" | "local" | "project" | "user";

export interface RefSetting {
  key: string;
  description: string;
  type: "boolean" | "choice" | "number" | "string" | "list" | "other";
  typeText: string;
  choices?: string[];
  default: string | null;
  scope: string;
  section?: string;
  value?: unknown;
  from: Source | "combined" | null;
  setIn: Source[];
}
export interface RefTopic {
  id: string;
  title: string;
  settings: RefSetting[];
}
export interface SettingsReferenceView {
  url: string;
  fetchedAt: string;
  origin: "live" | "cache" | "shipped";
  topics: RefTopic[];
}

/** Sections the page already has, by id, for settings they edit. */
export const SECTION_TITLES: Record<string, string> = {
  permissions: "Permissions",
  model: "Model",
  env: "Environment variables",
  "status-line": "Status line",
  sandbox: "Sandbox",
  themes: "Themes",
};

/** Rows whose key or description contains the text; topics left empty are dropped. */
export function filterTopics(topics: RefTopic[], find: string): RefTopic[] {
  const q = find.trim().toLowerCase();
  if (!q) return topics;
  return topics.map((t) => ({ ...t, settings: t.settings.filter((s) => s.key.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)) })).filter((t) => t.settings.length);
}

/** The reference's text with `code` spans shown as code. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(``.+?``|`[^`]+`)/).map((p, i) =>
        /^`.*`$/.test(p) ? (
          <code key={i} className="break-all">
            {p.replace(/^``? ?|`?` ?$/g, "").replace(/ $/, "")}
          </code>
        ) : (
          p
        ),
      )}
    </>
  );
}

const MAX = 300;
function valueText(v: unknown): string {
  const s = typeof v === "string" ? v : typeof v === "boolean" ? (v ? "On" : "Off") : JSON.stringify(v);
  return s.length > MAX ? `${s.slice(0, MAX)}…` : s;
}

interface Where {
  label: (s: Source) => string;
  /** The file to open for "Edit as text": where the value came from, else the file picked in "Change settings for". */
  pathOf: (s: Source) => string | undefined;
  target: Source;
}

function Now({ s, where }: { s: RefSetting; where: Where }) {
  if (s.from === null)
    return <span className="text-muted-foreground">{s.default ? <>Not set · default <Inline text={s.default} /></> : "Not set"}</span>;
  const from = s.from === "combined" ? `combined from ${s.setIn.map(where.label).join(" and ")}` : `from ${where.label(s.from)}`;
  return (
    <span>
      <code className="whitespace-pre-wrap break-all">{valueText(s.value)}</code> <span className="text-muted-foreground">{from}</span>
    </span>
  );
}

function Row({ s, where }: { s: RefSetting; where: Where }) {
  const file = s.from === null ? where.target : s.from === "combined" ? s.setIn[0] : s.from;
  const path = where.pathOf(file);
  let action: ReactNode = null;
  if (s.section)
    action = (
      <a href={`#${s.section}`} className="text-[13px]">
        In {SECTION_TITLES[s.section] ?? s.section}
      </a>
    );
  else if (s.type === "other" && path)
    action = (
      <Link to="/file" search={{ path, key: s.key }} className="text-[13px]">
        Edit as text
      </Link>
    );
  return (
    <li className="flex flex-col gap-1 px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <code className="min-w-0 break-all text-[13px] font-semibold">{s.key}</code>
        {action}
      </div>
      <p className="text-[13px] text-ink-2">
        <Inline text={s.description} />
      </p>
      <div className="min-w-0 text-[12.5px]">
        <Now s={s} where={where} />
      </div>
    </li>
  );
}

export function FindSetting({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-6">
      <label htmlFor={id} className="text-[14px] font-medium">
        Find a setting
      </label>
      <div className="relative max-w-[480px]">
        <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input id={id} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder="notif" spellCheck={false} autoComplete="off" className="pl-8" />
      </div>
    </div>
  );
}

export function TopicSections({ topics, where }: { topics: RefTopic[]; where: Where }) {
  return (
    <>
      {topics.map((t) => (
        <Section key={t.id} id={t.id} title={t.title}>
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
            {t.settings.map((s) => (
              <Row key={s.key} s={s} where={where} />
            ))}
          </ul>
        </Section>
      ))}
    </>
  );
}
