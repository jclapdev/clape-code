// Settings: how Claude Code behaves, in one of three settings files, plus keyboard shortcuts and themes.
// Keys and values are the ones documented on code.claude.com/docs/en/settings-reference (read 2026-10-18).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { api, enc } from "@/lib/api";
import type { Access, Project } from "@/lib/types";
import { cn, ErrorNote, Loading, Tag } from "@/components/ui";
import { Page } from "@/components/Panes";
import { SimpleSelect } from "@/components/SimpleSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section } from "./Projects";
import { AccountDetails } from "@/components/Account";

type Source = "managed" | "local" | "project" | "user";
type Obj = Record<string, any>;

interface SourceFile {
  source: Source;
  path: string;
  display: string;
  exists: boolean;
  access: Access;
  error: string | null;
  values: Obj | null;
}
interface KeyBlock {
  context: string;
  bindings: { key: string; action: string | null }[];
}
interface KeyAction {
  action: string;
  defaultKeys: string;
  description: string;
  group: string;
}
interface Theme {
  slug: string;
  name: string;
  base: string | null;
  overrides: number;
  path: string;
  display: string;
  error: string | null;
}
interface SettingsView {
  sources: SourceFile[];
  keybindings: { path: string; display: string; exists: boolean; access: Access; error: string | null; blocks: KeyBlock[]; contexts: { name: string; description: string }[]; actions: KeyAction[] };
  themes: Theme[];
}
interface Precedence {
  source: Source;
  label: string;
  path: string;
  note: string;
  exists: boolean;
}

export interface SettingsSearch {
  project?: string;
  file?: "shared" | "local";
}

const DOCS = "https://code.claude.com/docs/en/";
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const at = (o: Obj | null | undefined, path: string): unknown => path.split(".").reduce<unknown>((v, k) => (isObj(v) ? v[k] : undefined), o);
const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

/** Everything a section needs to read and change the chosen file. */
interface Ctx {
  target: Source;
  scope: string;
  local: boolean;
  sources: SourceFile[];
  label: (s: Source) => string;
  writable: boolean;
  project?: string;
}

function useChange(ctx: Ctx) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (change: Obj) => api.post("/settings/change", { scope: ctx.scope, local: ctx.local, change }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["settings"] }),
  });
}

/** Which file's value Claude Code uses for one key, and what that means for the chosen file. */
function InEffect({ ctx, path, render = show }: { ctx: Ctx; path: string; render?: (v: unknown) => ReactNode }) {
  const setIn = ctx.sources.filter((s) => at(s.values, path) !== undefined);
  if (!setIn.length) return <p className="text-[13px] text-muted-foreground">Not set in any settings file, so Claude Code's default applies.</p>;
  const win = setIn[0];
  const mine = setIn.find((s) => s.source === ctx.target);
  if (win.source === ctx.target) {
    const below = setIn.slice(1);
    return (
      <p className="text-[13px] text-muted-foreground">
        This file's value is the one in effect{below.length ? `, over ${below.map((s) => ctx.label(s.source)).join(" and ")}` : ""}.
      </p>
    );
  }
  return (
    <p className={cn("text-[13px]", mine ? "text-attn" : "text-muted-foreground")}>
      {mine ? "This file's value is overridden. " : ""}In effect: <span className="break-all font-mono">{render(at(win.values, path))}</span> from {ctx.label(win.source)}.
    </p>
  );
}

function Problem({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-[13.5px] text-danger">
      {error.message}
    </p>
  );
}

function Field({ label, hint, htmlFor, children }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[14px] font-medium">
        {label}
      </label>
      {hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

function Intro({ children, doc }: { children: ReactNode; doc: string }) {
  return (
    <p className="mb-4 max-w-[720px] text-ink-2">
      {children}{" "}
      <a href={`${DOCS}${doc}`} target="_blank" rel="noreferrer" className="whitespace-nowrap text-[13.5px]">
        Claude Code docs
      </a>
    </p>
  );
}

// ---- Permissions ----

const LISTS = [
  { id: "allow", label: "Allow", hint: "Claude does these without asking." },
  { id: "ask", label: "Ask first", hint: "Claude asks you each time, even in modes that would otherwise go ahead." },
  { id: "deny", label: "Never allow", hint: "Claude can't do these." },
] as const;

function Permissions({ ctx }: { ctx: Ctx }) {
  const qc = useQueryClient();
  const change = useChange(ctx);
  const [list, setList] = useState("allow");
  const [rule, setRule] = useState("");
  const add = useMutation({
    mutationFn: () => api.post("/settings/add", { scope: ctx.scope, local: ctx.local, what: "permission", list, rule }),
    onSuccess: () => {
      setRule("");
      void qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
  const id = useId();
  return (
    <>
      <Intro doc="permissions">
        Decide what Claude may do without asking, what it must ask about first, and what it may never do. Rules from every file are combined; never allow beats ask first, which beats allow.
      </Intro>
      <div className="flex flex-col gap-5">
        {LISTS.map((l) => {
          const rows = ctx.sources.flatMap((s) => ((at(s.values, `permissions.${l.id}`) as string[] | undefined) ?? []).map((r) => ({ rule: String(r), source: s.source })));
          return (
            <div key={l.id} className="flex flex-col gap-1.5">
              <h3 className="font-medium">
                {l.label} <span className="font-normal text-muted-foreground">· {l.hint}</span>
              </h3>
              {rows.length ? (
                <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
                  {rows.map((r) => (
                    <li key={`${r.source}:${r.rule}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <code className="min-w-0 break-all text-[13px]">{r.rule}</code>
                      {r.source === ctx.target ? (
                        <Button size="sm" variant="ghost" disabled={!ctx.writable} busy={change.isPending && change.variables?.rule === r.rule} onClick={() => change.mutate({ op: "permission-remove", list: l.id, rule: r.rule })}>
                          Remove
                        </Button>
                      ) : (
                        <span className="text-[12.5px] text-muted-foreground">from {ctx.label(r.source)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-muted-foreground">None.</p>
              )}
            </div>
          );
        })}
        <Problem error={change.error} />
        <form
          className="flex flex-col gap-2 rounded-lg border border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (rule.trim()) add.mutate();
          }}
        >
          <label htmlFor={id} className="text-[14px] font-medium">
            Add a rule
          </label>
          <p className="text-[13px] text-muted-foreground">
            A tool name, or a tool with what it applies to, such as <code>Bash(npm run *)</code>, <code>Read(./.env)</code> or <code>WebFetch(domain:example.com)</code>.
          </p>
          <div className="flex flex-wrap gap-2">
            <SimpleSelect label="Which list" value={list} onChange={setList} options={LISTS.map((l) => ({ value: l.id, label: l.label }))} className="w-[140px]" />
            <Input id={id} value={rule} onChange={(e) => setRule(e.target.value)} placeholder="Bash(npm run test)" spellCheck={false} autoComplete="off" className="min-w-0 flex-1 basis-[200px] font-mono text-[13px]" />
            <Button type="submit" disabled={!rule.trim() || !ctx.writable} busy={add.isPending}>
              Add
            </Button>
          </div>
          <Problem error={add.error} />
        </form>
      </div>
    </>
  );
}

// ---- Model ----

const MODELS = [
  { value: "sonnet", label: "sonnet: latest Sonnet, for daily coding" },
  { value: "opus", label: "opus: latest Opus, for complex reasoning" },
  { value: "haiku", label: "haiku: fast Haiku, for simple tasks" },
  { value: "fable", label: "fable: Fable, for the hardest, longest tasks" },
  { value: "best", label: "best: Fable where available, otherwise Opus" },
  { value: "sonnet[1m]", label: "sonnet[1m]: Sonnet with a 1 million token context" },
  { value: "opus[1m]", label: "opus[1m]: Opus with a 1 million token context" },
  { value: "opusplan", label: "opusplan: Opus while planning, then Sonnet" },
];
const OTHER = "__other__";

function Model({ ctx }: { ctx: Ctx }) {
  const change = useChange(ctx);
  const cur = at(ctx.sources.find((s) => s.source === ctx.target)?.values, "model") as string | undefined;
  const [pick, setPick] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const known = MODELS.some((m) => m.value === cur);
  const shown = pick ?? (cur === undefined ? "" : known ? cur : OTHER);
  const value = shown === OTHER ? (pick === null ? cur ?? "" : custom) : shown;
  const id = useId();
  return (
    <>
      <Intro doc="model-config">Which Claude model new sessions start with. You can still switch during a session with /model.</Intro>
      <div className="flex max-w-[640px] flex-col gap-3">
        <SimpleSelect
          label="Model"
          value={shown}
          onChange={(v) => {
            setPick(v);
            if (v === OTHER) setCustom(known ? "" : cur ?? "");
          }}
          options={[{ value: "", label: "Not set: your account's default" }, ...MODELS, { value: OTHER, label: "Another model by its full name" }]}
          className="w-full"
        />
        {shown === OTHER && (
          <Field label="Full model name" htmlFor={id} hint="Such as claude-opus-5-5, or your provider's model name.">
            <Input id={id} value={pick === null ? cur ?? "" : custom} onChange={(e) => (setPick(OTHER), setCustom(e.target.value))} spellCheck={false} autoComplete="off" className="font-mono text-[13px]" />
          </Field>
        )}
        <InEffect ctx={ctx} path="model" />
        <div className="flex flex-wrap gap-2">
          <Button disabled={!ctx.writable || pick === null || (shown === OTHER && !value.trim())} busy={change.isPending} onClick={() => change.mutate({ op: "model", value: value || null }, { onSuccess: () => setPick(null) })}>
            Save
          </Button>
        </div>
        <Problem error={change.error} />
      </div>
    </>
  );
}

// ---- Environment variables ----

function EnvValue({ ctx, source, name }: { ctx: Ctx; source: Source; name: string }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["env-value", source, ctx.project ?? "", name],
    queryFn: () => api.get<{ value: string }>(`/settings/env-value?source=${source}&name=${enc(name)}${ctx.project ? `&project=${enc(ctx.project)}` : ""}`),
    enabled: open,
    staleTime: 0,
    gcTime: 0, // don't keep a secret in memory after it's hidden
  });
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      {open && <code className="min-w-0 break-all text-[13px]">{q.isLoading ? "…" : q.error ? q.error.message : q.data?.value === "" ? "(empty)" : q.data?.value}</code>}
      <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>
        {open ? "Hide" : "Show value"}
      </Button>
    </span>
  );
}

function EnvVars({ ctx }: { ctx: Ctx }) {
  const change = useChange(ctx);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const names = [...new Set(ctx.sources.flatMap((s) => Object.keys((at(s.values, "env") as Obj | undefined) ?? {})))].sort();
  const id = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    change.mutate({ op: "env-set", name: name.trim(), value }, { onSuccess: () => (setName(""), setValue("")) });
  };
  return (
    <>
      <Intro doc="settings-reference#env">
        Variables set for every session and for the commands Claude runs. Values can be secrets, so they stay hidden until you show one.
      </Intro>
      <div className="flex flex-col gap-4">
        {names.length ? (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
            {names.map((n) => {
              const setIn = ctx.sources.filter((s) => isObj(at(s.values, "env")) && n in (at(s.values, "env") as Obj));
              const win = setIn[0];
              const mine = setIn.some((s) => s.source === ctx.target);
              return (
                <li key={n} className="flex flex-col gap-1 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <code className="min-w-0 break-all text-[13px] font-semibold">{n}</code>
                    <span className="flex flex-wrap items-center gap-1">
                      <EnvValue ctx={ctx} source={win.source} name={n} />
                      {mine && (
                        <Button size="sm" variant="ghost" disabled={!ctx.writable} busy={change.isPending && change.variables?.name === n && change.variables?.op === "env-remove"} onClick={() => change.mutate({ op: "env-remove", name: n })}>
                          Remove
                        </Button>
                      )}
                    </span>
                  </div>
                  <span className={cn("text-[12.5px]", mine && win.source !== ctx.target ? "text-attn" : "text-muted-foreground")}>
                    {win.source === ctx.target ? "Set in this file" : `${mine ? "Overridden: in effect " : "In effect "}from ${ctx.label(win.source)}`}
                    {setIn.length > 1 && win.source === ctx.target ? `, over ${setIn.slice(1).map((s) => ctx.label(s.source)).join(" and ")}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">No variables set.</p>
        )}
        <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border border-line p-3">
          <span className="text-[14px] font-medium">Set a variable</span>
          <p className="text-[13px] text-muted-foreground">Setting a name that's already in this file replaces its value. The value is saved as plain text in the file.</p>
          <div className="flex flex-wrap gap-2">
            <Input id={id} aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="NAME" spellCheck={false} autoComplete="off" className="min-w-0 flex-1 basis-[160px] font-mono text-[13px]" />
            <Input aria-label="Value" value={value} onChange={(e) => setValue(e.target.value)} placeholder="value" spellCheck={false} autoComplete="off" className="min-w-0 flex-[2] basis-[200px] font-mono text-[13px]" />
            <Button type="submit" disabled={!ctx.writable || !name.trim()} busy={change.isPending && change.variables?.op === "env-set"}>
              Save
            </Button>
          </div>
        </form>
        <Problem error={change.error} />
      </div>
    </>
  );
}

// ---- Status line ----

function StatusLine({ ctx }: { ctx: Ctx }) {
  const change = useChange(ctx);
  const cur = (at(ctx.sources.find((s) => s.source === ctx.target)?.values, "statusLine") as Obj | undefined) ?? {};
  const [draft, setDraft] = useState<{ command: string; padding: string; refresh: string; hideVim: boolean } | null>(null);
  const d = draft ?? { command: String(cur.command ?? ""), padding: cur.padding == null ? "" : String(cur.padding), refresh: cur.refreshInterval == null ? "" : String(cur.refreshInterval), hideVim: !!cur.hideVimModeIndicator };
  const set = (p: Partial<typeof d>) => setDraft({ ...d, ...p });
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const ids = { cmd: useId(), pad: useId(), ref: useId(), vim: useId() };
  return (
    <>
      <Intro doc="statusline">A line under the prompt in the terminal, drawn by a command or script you choose, such as one that shows the model and git branch.</Intro>
      <div className="flex max-w-[640px] flex-col gap-3">
        <Field label="Command" htmlFor={ids.cmd} hint="A script path or a shell command. It receives the session's details as JSON and prints the line.">
          <Input id={ids.cmd} value={d.command} onChange={(e) => set({ command: e.target.value })} placeholder="~/.claude/statusline.sh" spellCheck={false} autoComplete="off" className="font-mono text-[13px]" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Padding" htmlFor={ids.pad} hint="Extra spaces before the line. Empty means 0.">
            <Input id={ids.pad} type="number" min={0} value={d.padding} onChange={(e) => set({ padding: e.target.value })} />
          </Field>
          <Field label="Also refresh every (seconds)" htmlFor={ids.ref} hint="Empty means only when something changes.">
            <Input id={ids.ref} type="number" min={1} value={d.refresh} onChange={(e) => set({ refresh: e.target.value })} />
          </Field>
        </div>
        <label htmlFor={ids.vim} className="flex items-start gap-2 text-[14px]">
          <input id={ids.vim} type="checkbox" checked={d.hideVim} onChange={(e) => set({ hideVim: e.target.checked })} className="mt-1" />
          Hide Claude Code's own vim mode text, because my command shows it
        </label>
        <InEffect ctx={ctx} path="statusLine" render={(v) => String((v as Obj)?.command ?? show(v))} />
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!ctx.writable || !draft || !d.command.trim()}
            busy={change.isPending && !!change.variables?.command}
            onClick={() => change.mutate({ op: "statusline", command: d.command, padding: num(d.padding), refreshInterval: num(d.refresh), hideVimModeIndicator: d.hideVim }, { onSuccess: () => setDraft(null) })}
          >
            Save
          </Button>
          {cur.command !== undefined && (
            <Button variant="outline" disabled={!ctx.writable} busy={change.isPending && change.variables?.command === null} onClick={() => change.mutate({ op: "statusline", command: null }, { onSuccess: () => setDraft(null) })}>
              Remove from this file
            </Button>
          )}
        </div>
        <Problem error={change.error} />
      </div>
    </>
  );
}

// ---- Sandbox ----

const FLAGS = [
  { field: "enabled", label: "Sandbox shell commands", off: "Off" },
  { field: "autoAllowBashIfSandboxed", label: "Run sandboxed commands without asking", off: "On" },
  { field: "allowUnsandboxedCommands", label: "Let Claude retry a blocked command outside the sandbox (it still asks)", off: "On" },
  { field: "failIfUnavailable", label: "Refuse to start when the sandbox can't run", off: "Off" },
];
const SANDBOX_LISTS = [
  { field: "excludedCommands", label: "Commands that run outside the sandbox", placeholder: "docker *" },
  { field: "filesystem.allowWrite", label: "Extra places commands may write to", placeholder: "~/.kube" },
  { field: "filesystem.denyWrite", label: "Places commands may not write to", placeholder: "./secrets" },
  { field: "filesystem.denyRead", label: "Files and folders commands may not read", placeholder: "~/.aws/credentials" },
  { field: "network.allowedDomains", label: "Websites commands may reach without asking", placeholder: "github.com" },
  { field: "network.deniedDomains", label: "Websites commands may never reach", placeholder: "example.com" },
];

function SandboxList({ ctx, field, label, placeholder }: { ctx: Ctx; field: string; label: string; placeholder: string }) {
  const change = useChange(ctx);
  const [entry, setEntry] = useState("");
  const rows = ctx.sources.flatMap((s) => ((at(s.values, `sandbox.${field}`) as string[] | undefined) ?? []).map((v) => ({ v: String(v), source: s.source })));
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-[14px] font-medium">{label}</h4>
      {rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          {rows.map((r) => (
            <li key={`${r.source}:${r.v}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
              <code className="min-w-0 break-all text-[13px]">{r.v}</code>
              {r.source === ctx.target ? (
                <Button size="sm" variant="ghost" disabled={!ctx.writable} onClick={() => change.mutate({ op: "sandbox-list", field, remove: r.v })}>
                  Remove
                </Button>
              ) : (
                <span className="text-[12.5px] text-muted-foreground">from {ctx.label(r.source)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (entry.trim()) change.mutate({ op: "sandbox-list", field, add: entry }, { onSuccess: () => setEntry("") });
        }}
      >
        <Input aria-label={`Add to: ${label}`} value={entry} onChange={(e) => setEntry(e.target.value)} placeholder={placeholder} spellCheck={false} autoComplete="off" className="min-w-0 flex-1 font-mono text-[13px]" />
        <Button type="submit" variant="outline" disabled={!ctx.writable || !entry.trim()} busy={change.isPending && change.variables?.add !== undefined}>
          Add
        </Button>
      </form>
      <Problem error={change.error} />
    </div>
  );
}

function Sandbox({ ctx }: { ctx: Ctx }) {
  const change = useChange(ctx);
  const mine = ctx.sources.find((s) => s.source === ctx.target)?.values;
  return (
    <>
      <Intro doc="sandboxing">
        Runs the shell commands Claude starts inside a boundary your operating system enforces, limiting which files and websites they can reach. Works on macOS, Linux and WSL2. Lists from every file are combined.
      </Intro>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          {FLAGS.map((f) => {
            const v = at(mine, `sandbox.${f.field}`);
            return (
              <div key={f.field} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 basis-[220px] text-[14px]">{f.label}</span>
                  <SimpleSelect
                    label={f.label}
                    value={v === true ? "on" : v === false ? "off" : ""}
                    onChange={(x) => change.mutate({ op: "sandbox-flag", field: f.field, value: x === "on" ? true : x === "off" ? false : null })}
                    options={[
                      { value: "", label: `Not set (${f.off})` },
                      { value: "on", label: "On" },
                      { value: "off", label: "Off" },
                    ]}
                    disabled={!ctx.writable}
                    className="w-[150px]"
                  />
                </div>
                <InEffect ctx={ctx} path={`sandbox.${f.field}`} render={(x) => (x ? "On" : "Off")} />
              </div>
            );
          })}
          <Problem error={change.error} />
        </div>
        {SANDBOX_LISTS.map((l) => (
          <SandboxList key={l.field} ctx={ctx} {...l} />
        ))}
      </div>
    </>
  );
}

// ---- Keyboard shortcuts ----

function Shortcuts({ view }: { view: SettingsView["keybindings"] }) {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: ["settings"] });
  const set = useMutation({ mutationFn: (b: Obj) => api.post("/keybindings/set", b), onSuccess: done });
  const remove = useMutation({ mutationFn: (b: Obj) => api.post("/keybindings/remove", b), onSuccess: done });
  const [context, setContext] = useState("Chat");
  const [keys, setKeys] = useState("");
  const [action, setAction] = useState("");
  const [unbind, setUnbind] = useState(false);
  const byName = new Map(view.actions.map((a) => [a.action, a]));
  const chosen = byName.get(action.trim());
  const writable = view.access === "edit" && !view.error;
  const ids = { keys: useId(), action: useId(), list: useId() };
  const rows = view.blocks.flatMap((b) => b.bindings.map((x) => ({ ...x, context: b.context })));
  return (
    <>
      <Intro doc="keybindings">
        Your changes to Claude Code's keyboard shortcuts in the terminal. They apply in every project; anything you don't change keeps its default.
      </Intro>
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-muted-foreground">
          Kept in {view.display}
          {view.exists && (
            <>
              {" · "}
              <Link to="/file" search={{ path: view.path }}>
                Edit as text
              </Link>
            </>
          )}
        </p>
        {view.error && <p className="text-[13.5px] text-danger">{view.error}</p>}
        {rows.length ? (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
            {rows.map((r) => (
              <li key={`${r.context}:${r.key}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="flex min-w-0 flex-1 basis-[240px] flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <kbd className="rounded border border-line bg-sunken px-1.5 font-mono text-[12.5px]">{r.key}</kbd>
                    <span className="text-[13px]">{r.action ?? "Unbound: the default for these keys is turned off"}</span>
                    <Tag>{r.context}</Tag>
                  </span>
                  {r.action && byName.get(r.action) && <span className="text-[12.5px] text-muted-foreground">{byName.get(r.action)!.description}</span>}
                </span>
                <Button size="sm" variant="ghost" disabled={!writable} onClick={() => remove.mutate({ context: r.context, keys: r.key })}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">You haven't changed any shortcuts.</p>
        )}
        <Problem error={remove.error} />
        <form
          className="flex flex-col gap-3 rounded-lg border border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            set.mutate({ context, keys, action: unbind ? null : action.trim() }, { onSuccess: () => (setKeys(""), setAction(""), setUnbind(false)) });
          }}
        >
          <span className="text-[14px] font-medium">Change a shortcut</span>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Where it applies">
              <SimpleSelect label="Where it applies" value={context} onChange={setContext} options={view.contexts.map((c) => ({ value: c.name, label: c.name }))} className="w-full" />
              <span className="text-[12.5px] text-muted-foreground">{view.contexts.find((c) => c.name === context)?.description}</span>
            </Field>
            <Field label="Keys" htmlFor={ids.keys} hint="Such as ctrl+e, meta+p, or a chord: ctrl+k ctrl+s.">
              <Input id={ids.keys} value={keys} onChange={(e) => setKeys(e.target.value)} placeholder="ctrl+e" spellCheck={false} autoComplete="off" className="font-mono text-[13px]" />
            </Field>
          </div>
          <label className="flex items-start gap-2 text-[14px]">
            <input type="checkbox" checked={unbind} onChange={(e) => setUnbind(e.target.checked)} className="mt-1" />
            Unbind: make these keys do nothing instead of their default
          </label>
          {!unbind && (
            <Field label="Action" htmlFor={ids.action} hint="Start typing to pick from Claude Code's list.">
              <Input id={ids.action} list={ids.list} value={action} onChange={(e) => setAction(e.target.value)} placeholder="chat:externalEditor" spellCheck={false} autoComplete="off" className="font-mono text-[13px]" />
              <datalist id={ids.list}>
                {view.actions.map((a) => (
                  <option key={a.action} value={a.action}>
                    {a.description}
                  </option>
                ))}
              </datalist>
              {chosen && (
                <span className="text-[12.5px] text-muted-foreground">
                  {chosen.description} Default: {chosen.defaultKeys}.
                </span>
              )}
            </Field>
          )}
          <div>
            <Button type="submit" disabled={!writable || !keys.trim() || (!unbind && !chosen)} busy={set.isPending}>
              Save shortcut
            </Button>
          </div>
          <Problem error={set.error} />
        </form>
      </div>
    </>
  );
}

// ---- Themes ----

const BUILT_IN = [
  { value: "auto", label: "Match the terminal (auto)" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "dark-daltonized", label: "Dark, colorblind-friendly" },
  { value: "light-daltonized", label: "Light, colorblind-friendly" },
  { value: "dark-ansi", label: "Dark, terminal colors only" },
  { value: "light-ansi", label: "Light, terminal colors only" },
];

function Themes({ ctx, themes }: { ctx: Ctx; themes: Theme[] }) {
  const change = useChange(ctx);
  const cur = at(ctx.sources.find((s) => s.source === ctx.target)?.values, "theme") as string | undefined;
  const options = [{ value: "", label: "Not set (dark)" }, ...BUILT_IN, ...themes.filter((t) => !t.error).map((t) => ({ value: `custom:${t.slug}`, label: `${t.name} (yours)` }))];
  if (cur && !options.some((o) => o.value === cur)) options.push({ value: cur, label: cur });
  return (
    <>
      <Intro doc="settings-reference#theme">The colors of Claude Code in the terminal: one of the built-in themes, or one of your own from ~/.claude/themes.</Intro>
      <div className="flex max-w-[640px] flex-col gap-3">
        <SimpleSelect label="Theme" value={cur ?? ""} onChange={(v) => change.mutate({ op: "theme", value: v || null })} options={options} disabled={!ctx.writable} className="w-full" />
        <InEffect ctx={ctx} path="theme" />
        <Problem error={change.error} />
        <h3 className="mt-2 font-medium">Custom themes</h3>
        {themes.length ? (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
            {themes.map((t) => (
              <li key={t.slug} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{t.name}</span>
                  <span className="text-[12.5px] text-muted-foreground">{t.error ?? `Based on ${t.base ?? "dark"}, ${t.overrides} color${t.overrides === 1 ? "" : "s"} changed`}</span>
                </span>
                <Link to="/file" search={{ path: t.path }} className="text-[13px]">
                  Edit as text
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">None. Make one in Claude Code with /theme.</p>
        )}
      </div>
    </>
  );
}

// ---- The page ----

function WhichFile({ precedence, sources, label, target }: { precedence: Precedence[]; sources: SourceFile[]; label: (s: Source) => string; target: Source }) {
  const shown = precedence.filter((p) => sources.some((s) => s.source === p.source));
  return (
    <section aria-label="Which file wins" className="flex flex-col gap-2">
      <p className="text-[13px] text-muted-foreground">When two files set the same thing, the higher one in this list wins. Lists, such as permission rules, are combined.</p>
      <ol className="flex flex-col gap-1.5">
        {shown.map((p, i) => {
          const s = sources.find((x) => x.source === p.source)!;
          return (
            <li key={p.source} className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg border px-3 py-2", s.source === target ? "border-primary-line bg-accent" : "border-line bg-surface", !s.exists && "border-dashed")}>
              <span className="font-medium">
                {i + 1}. {label(p.source).replace(/^./, (c) => c.toUpperCase())}
              </span>
              <span className="min-w-0 break-all font-mono text-[12px] text-muted-foreground">{s.display}</span>
              <span className="text-[12.5px] text-muted-foreground">
                {s.error ? <span className="text-danger">{s.error}</span> : !s.exists ? "Not created yet" : null}
                {s.exists && (
                  <Link to="/file" search={{ path: s.path }} className="ml-1">
                    Edit as text
                  </Link>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function SettingsPage() {
  const search = useSearch({ from: "/settings" }) as SettingsSearch;
  const navigate = useNavigate();
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/projects") });
  const project = search.project;
  const local = search.file === "local";
  const view = useQuery({ queryKey: ["settings", project ?? ""], queryFn: () => api.get<SettingsView>(`/settings${project ? `?project=${enc(project)}` : ""}`) });
  const map = useQuery({ queryKey: ["map"], queryFn: () => api.get<{ precedence: Precedence[] }>("/map") });
  const go = (s: SettingsSearch) => void navigate({ to: "/settings", search: s, replace: true });

  if (view.error) return <ErrorNote error={view.error} />;
  if (!view.data || !map.data) return <Loading />;
  const name = projects.data?.find((p) => p.id === project)?.name ?? project ?? "";
  const label = (s: Source) =>
    ({ managed: "your organization's managed settings", user: "your settings for every project", project: `${name}'s shared settings`, local: `your settings for ${name}` })[s];
  const target: Source = !project ? "user" : local ? "local" : "project";
  const file = view.data.sources.find((s) => s.source === target)!;
  const ctx: Ctx = { target, scope: project ?? "global", local, sources: view.data.sources, label, writable: file.access === "edit" && !file.error, project };

  const sections: { id: string; title: string; node: ReactNode }[] = [
    { id: "permissions", title: "Permissions", node: <Permissions ctx={ctx} /> },
    { id: "model", title: "Model", node: <Model key={`${project}:${target}`} ctx={ctx} /> },
    { id: "env", title: "Environment variables", node: <EnvVars ctx={ctx} /> },
    { id: "status-line", title: "Status line", node: <StatusLine key={`${project}:${target}`} ctx={ctx} /> },
    { id: "sandbox", title: "Sandbox", node: <Sandbox ctx={ctx} /> },
    { id: "shortcuts", title: "Keyboard shortcuts", node: <Shortcuts view={view.data.keybindings} /> },
    { id: "themes", title: "Themes", node: <Themes ctx={ctx} themes={view.data.themes} /> },
  ];
  const projectOptions = (projects.data ?? []).filter((p) => !p.empty);

  return (
    <Page title="Settings">
      <div className="flex gap-8">
        <div className="flex min-w-0 max-w-[900px] flex-1 flex-col">
          <Section id="account" title="Account">
            <AccountDetails project={project} />
          </Section>
          <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Change settings for">
                <SimpleSelect
                  label="Change settings for"
                  value={project ?? ""}
                  onChange={(v) => go(v ? { project: v, file: search.file } : {})}
                  options={[{ value: "", label: "Every project" }, ...projectOptions.map((p) => ({ value: p.id, label: p.name }))]}
                  className="w-[240px] max-w-full"
                />
              </Field>
              {project && (
                <div role="radiogroup" aria-label="Which file" className="flex flex-wrap gap-1">
                  {[
                    { v: "shared", label: "Shared with the project" },
                    { v: "local", label: "Only you" },
                  ].map((o) => {
                    const on = (o.v === "local") === local;
                    return (
                      <Button key={o.v} role="radio" aria-checked={on} variant={on ? "secondary" : "ghost"} onClick={() => go({ project, file: o.v as "shared" | "local" })}>
                        {o.label}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="text-[13.5px] text-ink-2">
              {!project
                ? "Changes go to your settings for every project."
                : local
                  ? `Changes go to your own settings for ${name}, which aren't shared through git.`
                  : `Changes go to ${name}'s shared settings, which everyone working on it gets through git.`}{" "}
              {!ctx.writable && <span className="text-danger">This file can't be changed here{file.error ? " until it's fixed as text" : ""}.</span>}
            </p>
            <WhichFile precedence={map.data.precedence} sources={view.data.sources} label={label} target={target} />
          </div>
          {sections.map((s) => (
            <Section key={s.id} id={s.id} title={s.title}>
              {s.node}
            </Section>
          ))}
        </div>
        <nav aria-label="On this page" className="sticky top-4 hidden h-fit w-48 flex-none xl:block">
          <ul className="flex flex-col gap-0.5 text-[13.5px]">
            {[{ id: "account", title: "Account" }, ...sections].map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded px-2 py-1 text-ink-2 no-underline hover:bg-sunken">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </Page>
  );
}
