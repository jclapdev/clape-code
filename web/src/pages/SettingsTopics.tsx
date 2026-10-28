// Every documented setting, one section per topic of Claude Code's settings reference (spec 005), with its value now
// and a control to change it in the file picked in "Change settings for".
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/lib/api";
import { Switch } from "@/components/ui";
import { SimpleSelect } from "@/components/SimpleSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  /** The files it can be written to, from its scope. */
  targets: Source[];
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

/**
 * Text and code spans: a span opens with a run of backticks and closes at the next run of the same length, and one
 * space is trimmed from each end when both have one (CommonMark), so `` !`...` `` shows as !`...`.
 */
function split(text: string): { text: string; code: boolean }[] {
  const out: { text: string; code: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(/(?<!`)(`+)(?!`)([\s\S]+?)(?<!`)\1(?!`)/g)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), code: false });
    const inner = m[2];
    out.push({ text: /^ [\s\S]* $/.test(inner) && inner.trim() ? inner.slice(1, -1) : inner, code: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), code: false });
  return out;
}

/** The reference's text with `code` spans shown as code. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {split(text).map((p, i) =>
        p.code ? (
          <code key={i} className="break-all">
            {p.text}
          </code>
        ) : (
          p.text
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

export interface Where {
  label: (s: Source) => string;
  /** The file to open for "Edit as text": where the value came from, else the file picked in "Change settings for". */
  pathOf: (s: Source) => string | undefined;
  target: Source;
  /** The file picked in "Change settings for": its values, its hash as read, and whether it can be changed here. */
  values: Record<string, unknown> | null;
  hash: string | null;
  writable: boolean;
  scope: string;
  local: boolean;
  /** Keeps the file's new hash after a write, so a second change before the page reloads isn't refused. */
  wrote: (hash: string) => void;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const at = (o: unknown, key: string): unknown => key.split(".").reduce<unknown>((v, k) => (isObj(v) ? v[k] : undefined), o);

/** Where a setting that can't go in the picked file can be set. */
function onlyIn(targets: Source[]): string {
  if (targets.join() === "user") return "Can be set only in your settings for every project.";
  const names = targets.map((t) => (t === "user" ? "your settings for every project" : t === "local" ? `a project's "Only you" settings` : "a project's shared settings"));
  return `Can be set only in ${names.join(" or ")}.`;
}

/** The control for one setting, writing to the file picked in "Change settings for". Off, empty or Not set removes the key. */
function Control({ s, where }: { s: RefSetting; where: Where }) {
  const qc = useQueryClient();
  const id = useId();
  const mine = at(where.values, s.key);
  const set = useMutation({
    mutationFn: (value: unknown) => api.post<{ hash: string | null }>("/settings/set", { scope: where.scope, local: where.local, key: s.key, value, hash: where.hash }),
    onSuccess: (r) => r.hash && where.wrote(r.hash),
    // After a refusal too: the file may have changed on disk, and the page needs its new hash.
    onSettled: () => void qc.invalidateQueries({ queryKey: ["settings"] }),
  });
  const allowed = s.targets.includes(where.target);
  const disabled = !allowed || !where.writable || set.isPending;
  const text = (v: unknown) => (s.type === "list" ? (Array.isArray(v) ? v.join("\n") : "") : v === undefined || v === null ? "" : String(v));
  const [draft, setDraft] = useState(text(mine));
  const [seen, setSeen] = useState(mine);
  if (JSON.stringify(seen) !== JSON.stringify(mine)) {
    setSeen(mine);
    setDraft(text(mine));
  }
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (s.type === "number") set.mutate(draft.trim() === "" ? null : Number(draft));
    else if (s.type === "list") set.mutate(draft.split("\n"));
    else set.mutate(draft);
  };

  let control: ReactNode = null;
  if (s.type === "boolean") {
    // The server decides whether off removes the key or writes false (settingValue in server/src/parsers/settingsEdit.ts).
    // Not set in the picked file: show the value in effect, so a setting another file turns on shows On and can be turned off.
    const on = mine === undefined ? (typeof s.value === "boolean" ? s.value : /^`true`/.test(s.default ?? "")) : mine === true;
    control = <Switch label={on ? "On" : "Off"} ariaLabel={s.key} on={on} disabled={disabled} onChange={(v) => set.mutate(v)} />;
  } else if (s.type === "choice") {
    control = (
      <SimpleSelect
        label={s.key}
        value={typeof mine === "string" ? mine : ""}
        onChange={(v) => set.mutate(v || null)}
        options={[{ value: "", label: "Not set" }, ...(s.choices ?? []).map((c) => ({ value: c, label: c }))]}
        disabled={disabled}
        className="w-[200px] max-w-full"
      />
    );
  } else if (s.type === "number" || s.type === "string" || s.type === "list") {
    const field =
      s.type === "list" ? (
        <Textarea id={id} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={disabled} placeholder="One per line" spellCheck={false} className="min-w-0 max-w-[480px] flex-1 basis-[220px] font-mono text-[13px]" />
      ) : (
        <Input
          id={id}
          type={s.type === "number" ? "number" : "text"}
          step="any"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={disabled}
          placeholder="Not set"
          spellCheck={false}
          autoComplete="off"
          className={s.type === "number" ? "w-[160px] max-w-full" : "min-w-0 max-w-[480px] flex-1 basis-[220px] font-mono text-[13px]"}
        />
      );
    control = (
      <form onSubmit={save} className="flex min-w-0 flex-wrap items-start gap-2">
        <label htmlFor={id} className="sr-only">
          {s.key}
        </label>
        {field}
        {draft !== text(mine) && (
          <Button type="submit" variant="outline" disabled={disabled} busy={set.isPending}>
            Save
          </Button>
        )}
      </form>
    );
  }
  if (!control) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {control}
      {!allowed && <p className="text-[12.5px] text-muted-foreground">{onlyIn(s.targets)}</p>}
      {set.error && (
        <p role="alert" className="text-[13px] text-danger">
          {set.error.message}
        </p>
      )}
    </div>
  );
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
      {!s.section && <Control key={`${where.scope}:${where.target}`} s={s} where={where} />}
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
