import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link, useParams } from "@tanstack/react-router";
import { ChevronDown, Pencil, Plus } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError, enc } from "@/lib/api";
import { when } from "@/lib/format";
import type { BacklogItem, LibraryItem, Project, ProjectDetail } from "@/lib/types";
import { openOnComputer } from "@/components/FileEditor";
import { DetailHeader } from "@/components/Panes";
import { Readable } from "@/components/Readable";
import type { NewKind } from "./NewItem";
import { EmptyState, ErrorNote, Loading, Md, Tag, cn, useConfirm } from "@/components/ui";
import { SimpleSelect } from "@/components/SimpleSelect";
import { IconButton } from "@/components/IconButton";
import { Checkbox } from "@/components/ui/checkbox";

function ProjectOverview() {
  const q = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/projects") });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const mine = (q.data ?? []).filter((p) => p.group === "root");
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <h1 className="text-[24px] font-semibold">Projects</h1>
      <div className="mt-6 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {mine.map((p) => (
          <Link key={p.id} to="/projects/$id" params={{ id: p.id }} search={{}} className="flex flex-col gap-1 rounded-lg border border-line bg-surface px-4 py-3 text-ink no-underline hover:border-line-strong">
            <span className="font-medium">{p.name}</span>
            <span className="text-[13px] text-muted-foreground">
              {p.sessions ? `${p.sessions} ${p.sessions === 1 ? "session" : "sessions"}, last ${when(p.lastSessionAt)}` : "No sessions yet"}
            </span>
            {p.backlog && p.backlog.open > 0 && <span className="text-[13px] text-muted-foreground">{p.backlog.open} open in the backlog</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}

function BacklogTab({ p }: { p: ProjectDetail }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState<number | null>(null);
  const b = p.backlog;

  const run = useMutation({
    mutationFn: ({ op, body }: { op: string; body: object }) => api.post(`/projects/${enc(p.id)}/backlog/${op}`, { ...body, hash: b!.hash }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", p.id] }),
    onError: (e: Error) => {
      toast.error(e instanceof ApiError && e.status === 409 ? "BACKLOG.md changed on disk. It has been reloaded; try again." : e.message);
      qc.invalidateQueries({ queryKey: ["project", p.id] });
    },
  });

  if (!b) {
    return (
      <EmptyState title="No progress note yet">A progress note lists what's done, in progress and next, so whoever picks the project up next knows where it stands.</EmptyState>
    );
  }
  const all = b.sections.flatMap((s) => s.items);
  const done = all.filter((i) => i.done).length;

  const toggle = (it: BacklogItem) => {
    qc.setQueryData(["project", p.id], (old: ProjectDetail | undefined) =>
      old?.backlog ? { ...old, backlog: { ...old.backlog, sections: old.backlog.sections.map((s) => ({ ...s, items: s.items.map((x) => (x.line === it.line ? { ...x, done: !x.done } : x)) })) } } : old,
    );
    run.mutate({ op: "toggle", body: { line: it.line } });
  };

  return (
    <div className="flex flex-col gap-4 p-6 md:pl-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-2">
          {b.intro && <span>{b.intro} </span>}
          {b.checkboxes && <span className="text-muted-foreground">{done} of {all.length} done.</span>}
        </p>
        <Link to="/file" search={{ path: b.path }} className="text-[13px]">
          Edit as text
        </Link>
      </div>
      {b.sections.map((s) => {
        const sd = s.items.filter((i) => i.done).length;
        return (
          <section key={s.line} className="rounded-lg border border-line bg-surface px-4 py-2">
            <div className="flex items-baseline justify-between py-2">
              <h3 className="text-[15px] font-semibold">{s.name || "Items"}</h3>
              {b.checkboxes && s.items.length > 0 && <span className="text-xs text-muted-foreground">{sd} of {s.items.length} done</span>}
            </div>
            {s.intro && <p className="pb-2 text-[13px] text-muted-foreground">{s.intro}</p>}
            <ul>
              {s.items.map((it) => (
                <li key={it.line} className="group flex items-start gap-3 border-t border-line py-2">
                  {it.done !== null ? (
                    <Checkbox checked={it.done} onCheckedChange={() => toggle(it)} aria-label={`Mark ${it.n ?? ""} ${it.done ? "not done" : "done"}`} className="mt-1 flex-none" />
                  ) : (
                    <span className="mt-2 size-1.5 flex-none rounded-full bg-faint" aria-hidden />
                  )}
                  {it.n !== null && <span className="w-6 flex-none pt-px font-mono text-[12.5px] text-muted-foreground">{it.n}.</span>}
                  {editing === it.line ? (
                    <form
                      className="flex flex-1 gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        run.mutate({ op: "edit", body: { line: it.line, text: draft } });
                        setEditing(null);
                      }}
                    >
                      <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setEditing(null)} className="flex-1" aria-label="Item text" />
                      <Button type="submit" variant="default">
                        Save
                      </Button>
                    </form>
                  ) : (
                    <>
                      <span className={cn("flex-1 leading-relaxed", it.done && "text-muted-foreground")}>
                        <Md className="[&_p]:m-0">{it.text}</Md>
                      </span>
                      <IconButton
                        label="Edit item"
                        size="icon-sm"
                        onClick={() => {
                          setEditing(it.line);
                          setDraft(it.text);
                        }}
                        className="invisible flex-none text-muted-foreground group-hover:visible focus-visible:visible"
                      >
                        <Pencil />
                      </IconButton>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {adding === s.line ? (
              <form
                className="flex gap-2 border-t border-line py-2"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  if (!draft.trim()) return;
                  run.mutate({ op: "add", body: { sectionLine: s.line, text: draft } });
                  setAdding(null);
                  setDraft("");
                }}
              >
                <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setAdding(null)} placeholder="What needs doing?" className="flex-1" aria-label="New item" />
                <Button type="submit" variant="default">
                  Add
                </Button>
              </form>
            ) : (
              <div className="border-t border-line py-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAdding(s.line);
                    setDraft("");
                  }}
                  className="text-muted-foreground"
                >
                  <Plus aria-hidden /> Add item
                </Button>
              </div>
            )}
          </section>
        );
      })}
      <p className="text-xs text-muted-foreground">Changes edit only the line you touch. Every save keeps the previous file as a backup.</p>
    </div>
  );
}

const KINDS = ["Added", "Changed", "Fixed", "Removed", "Deprecated", "Security"];

function ChangelogTab({ p }: { p: ProjectDetail }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [kind, setKind] = useState("Added");
  const c = p.changelog;
  const add = useMutation({
    mutationFn: () => api.post(`/projects/${enc(p.id)}/changelog`, { text, kind, hash: c!.hash }),
    onSuccess: () => {
      setText("");
      toast.success(c?.keep ? `Added under Unreleased, ${kind}.` : "Added to today's changes.");
      qc.invalidateQueries({ queryKey: ["project", p.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!c) return null;
  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) add.mutate();
        }}
      >
        <label htmlFor="cl" className="text-[13px] font-medium">
          {c.keep ? "Add a change to Unreleased" : "Add a change for today"}
        </label>
        <Textarea id="cl" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="What changed, in a sentence the reader will understand." className="resize-y" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {c.keep ? <SimpleSelect label="Kind of change" value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: k }))} /> : <span />}
          <Button type="submit" variant="default" busy={add.isPending} disabled={!text.trim()}>
            Add
          </Button>
        </div>
      </form>
      {c.days.map((d) => {
        const groups: [string | null, string[]][] = [];
        d.entries.forEach((e, i) => {
          const k = d.kinds[i] ?? null;
          const g = groups.find(([n]) => n === k);
          if (g) g[1].push(e);
          else groups.push([k, [e]]);
        });
        return (
          <section key={d.line}>
            <h3 className="mb-2 text-[15px] font-semibold">{d.date}</h3>
            {groups.map(([k, es]) => (
              <div key={k ?? "-"} className="mb-2">
                {k && <h4 className="mb-1 text-[13px] font-medium text-muted-foreground">{k}</h4>}
                <ul className="flex flex-col gap-1.5 border-l-2 border-line pl-4">
                  {es.map((e, i) => (
                    <li key={i}>
                      <Md className="[&_p]:m-0">{e}</Md>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

/** One titled block of the project page. Always open; the contents list links to it. */
export function Section({ id, title, action, children }: { id: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-4 border-t border-line py-6 first:border-t-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${id}-h`} className="text-[17px] font-semibold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const STATE_LABEL: Record<string, string> = { off: "Turned off", "name-only": "Name only", "user-invocable-only": "Only when you type it" };

/** A skill, agent, command, rule, hook or note: its name and full description; opens in place, readable. */
const SKILL_STATES = [
  { value: "on", label: "On: Claude uses it when it fits, and you can type /name" },
  { value: "name-only", label: "Name only: Claude sees just its name" },
  { value: "user-invocable-only", label: "Only when you type /name" },
  { value: "off", label: "Off: Claude can't use it and it's not in the / list" },
];
const DELETABLE: LibraryItem["kind"][] = ["skill", "agent", "command", "rule", "output-style", "plan", "memory"];

/** What you can do with one item: turn a skill or plugin on or off, check a skill, delete it. */
function ItemActions({ i, scope }: { i: LibraryItem; scope: string }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [check, setCheck] = useState<{ ok: boolean; output: string; available: boolean } | null>(null);
  const done = () => void qc.invalidateQueries();
  const state = useMutation({
    mutationFn: (v: string) => (i.kind === "plugin" ? api.post("/library/plugin", { key: i.overrideKey, enabled: v === "on" }) : api.post("/library/skill-state", { key: i.overrideKey, state: v, scope })),
    onSuccess: done,
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: () => api.post("/library/delete", { path: i.path, kind: i.kind }),
    onSuccess: () => (toast.success(`Moved ${i.name} to the trash.`), done()),
    onError: (e: Error) => toast.error(e.message),
  });
  const validate = useMutation({
    mutationFn: () => api.post<{ ok: boolean; output: string; available: boolean }>("/library/validate", { path: i.path }),
    onSuccess: setCheck,
    onError: (e: Error) => toast.error(e.message),
  });
  const editable = i.access === "edit";
  const canState = (i.kind === "skill" && !!i.overrideKey && i.source !== "plugin") || i.kind === "plugin";
  const canDelete = editable && DELETABLE.includes(i.kind) && i.source !== "plugin" && i.source !== "synced";
  if (!canState && !canDelete && i.kind !== "skill") return null;
  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {canState && (
          <SimpleSelect
            label={i.kind === "plugin" ? "Plugin on or off" : "Can Claude use it"}
            value={i.kind === "plugin" ? (i.state === "off" ? "off" : "on") : (i.state ?? "on")}
            onChange={(v) => state.mutate(v)}
            options={i.kind === "plugin" ? [{ value: "on", label: "On" }, { value: "off", label: "Off" }] : SKILL_STATES}
          />
        )}
        {i.kind === "skill" && i.source === "plugin" && <span className="text-[13px] text-muted-foreground">Turned on or off with its plugin.</span>}
        {i.kind === "skill" && editable && (
          <Button size="sm" variant="outline" busy={validate.isPending} onClick={() => validate.mutate()}>
            Check against the standard
          </Button>
        )}
        {canDelete && (
          <Button
            size="sm"
            variant="outline"
            className="text-danger"
            busy={del.isPending}
            onClick={async () => {
              if (await confirm({ title: `Delete ${i.name}?`, body: "It moves to your computer's trash, where you can still get it back.", confirm: "Move to trash", danger: true })) del.mutate();
            }}
          >
            Delete
          </Button>
        )}
      </div>
      {check && (
        <p className={cn("rounded-md px-3 py-2 text-[13px]", check.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger")}>
          {!check.available ? check.output : check.ok ? "It follows the Agent Skills standard." : `It doesn't follow the standard yet: ${check.output.split("\n").filter(Boolean).slice(-3).join(" ")}`}
        </p>
      )}
    </div>
  );
}

export function ItemRows({ items, empty, usage, scope = "global" }: { items: LibraryItem[]; empty: string; usage?: (i: LibraryItem) => string | null; scope?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!items.length) return <p className="text-[13.5px] text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
      {items.map((i) => {
        const key = `${i.kind}:${i.path}:${i.line ?? ""}`;
        const isOpen = open === key;
        return (
          <li key={key}>
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : key)} className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-sunken">
              <span className="flex w-full flex-wrap items-center gap-2">
                <span className="font-medium">{i.name}</span>
                {usage?.(i) && <code className="rounded bg-sunken px-1.5 py-0.5 text-[12.5px]">{usage(i)}</code>}
                {i.kind !== "plugin" && i.source === "plugin" && <Tag>From plugin {i.sourceName}</Tag>}
                {i.source === "synced" && <Tag>From claude.ai</Tag>}
                {i.state && i.state !== "on" && <Tag>{STATE_LABEL[i.state] ?? i.state}</Tag>}
                {i.error && <Tag tone="danger">Has a mistake</Tag>}
                <ChevronDown aria-hidden className={cn("ml-auto size-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
              </span>
              {i.description && <span className="text-[13.5px] leading-relaxed text-ink-2">{i.description}</span>}
            </button>
            {isOpen && (
              <div className="border-t border-line px-5 py-4">
                {i.kind === "hook-def" ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-[13.5px]">When: {i.name}. It runs:</p>
                    <pre className="overflow-auto whitespace-pre-wrap rounded-md bg-sunken p-3 text-[13px]">{i.description}</pre>
                    <Link to="/file" search={{ path: i.path }} className="text-[13px]">
                      Edit in {i.display}
                    </Link>
                  </div>
                ) : (
                  <>
                    <ItemActions i={i} scope={scope} />
                    <Readable path={i.path} />
                  </>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SessionRows({ p }: { p: ProjectDetail }) {
  const [all, setAll] = useState(false);
  if (!p.sessions.length) return <p className="text-[13.5px] text-muted-foreground">No sessions yet. Press "New session here" to give Claude a task in this project.</p>;
  const plansBy = new Map<string, ProjectDetail["plans"]>();
  for (const pl of p.plans) plansBy.set(pl.sessionId, [...(plansBy.get(pl.sessionId) ?? []), pl]);
  const shown = all ? p.sessions : p.sessions.slice(0, 10);
  return (
    <>
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {shown.map((s) => (
          <li key={s.sessionId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
            <div className="min-w-0 flex-1">
              <Link to="/sessions/$sid" params={{ sid: s.sessionId }} search={{}} className="font-medium text-ink no-underline hover:underline">
                {s.displayTitle}
              </Link>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12.5px] text-muted-foreground">
                <span>{when(s.lastAt)}</span>
                {s.gitBranch && <span>branch {s.gitBranch}</span>}
                <span>{s.prompts} {s.prompts === 1 ? "message" : "messages"} from you</span>
                {s.worktree && <span>in a separate worktree</span>}
              </div>
              {(plansBy.get(s.sessionId) ?? []).map((pl) => (
                <a key={pl.path} href={`#plan-${encodeURIComponent(pl.path)}`} className="mt-1 block text-[13px]">
                  Plan: {pl.title.replace(/^plan:\s*/i, "")}
                </a>
              ))}
            </div>
            {s.running ? (
              <Tag tone="accent">Running now</Tag>
            ) : (
              <Button asChild variant="outline" size="sm" className="no-underline">
                <Link to="/live" search={{ resume: s.sessionId }}>
                  Continue
                </Link>
              </Button>
            )}
          </li>
        ))}
      </ul>
      {!all && p.sessions.length > 10 && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAll(true)}>
          Show all {p.sessions.length} sessions
        </Button>
      )}
    </>
  );
}

export function PlanCard({ plan, open }: { plan: ProjectDetail["plans"][number]; open: boolean }) {
  const [shown, setShown] = useState(open);
  return (
    <article id={`plan-${encodeURIComponent(plan.path)}`} className="scroll-mt-4 rounded-lg border border-line bg-surface">
      <button type="button" onClick={() => setShown(!shown)} aria-expanded={shown} className="flex w-full flex-wrap items-baseline gap-x-3 px-4 py-3 text-left">
        <span className="flex-1 font-medium">{plan.title.replace(/^plan:\s*/i, "")}</span>
        <span className="text-[12.5px] text-muted-foreground">
          {when(plan.at)} · from "{plan.sessionTitle}"
        </span>
      </button>
      {shown && (
        <div className="border-t border-line px-5 py-4">
          <Readable path={plan.path} />
        </div>
      )}
    </article>
  );
}

export function MdFile({ path }: { path: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-5 py-4">
      <Readable path={path} />
    </div>
  );
}

/** Opens the creation form for one kind of item, already pointed at this project or at Settings. */
export function NewButton({ kind, scope, label }: { kind: NewKind; scope: string; label: string }) {
  return (
    <Button asChild size="sm" variant="outline" className="no-underline">
      <Link to="/new" search={{ kind, scope }}>
        <Plus aria-hidden /> {label}
      </Link>
    </Button>
  );
}

/** A button that opens a form or a pre-filled session. */
export function ActionLink({ to, search, label, primary }: { to: "/add" | "/live"; search: Record<string, string>; label: string; primary?: boolean }) {
  return (
    <Button asChild size="sm" variant={primary ? "default" : "outline"} className="no-underline">
      <Link to={to} search={search}>
        {label}
      </Link>
    </Button>
  );
}

export const nameOf = (i: LibraryItem) => (i.folder ? i.folder.split(/[\\/]/).filter(Boolean).pop()! : i.name).replace(/\.md$/, "");

const docItem: LibraryItem = { kind: "claude-md", name: "", description: "", path: "", display: "", folder: null, source: "project", sourceName: null, access: "edit", state: null, overrideKey: null, mtime: null, error: null, meta: {} };

function PlanBacklog({ p }: { p: ProjectDetail }) {
  const plans = p.plans.filter((pl) => pl.open.length);
  if (!plans.length) return <p className="text-[13.5px] text-muted-foreground">Nothing open. When a plan has unticked items, or the project has a BACKLOG.md, they show here.</p>;
  return (
    <div className="flex flex-col gap-3">
      {plans.map((pl) => (
        <section key={pl.path} className="rounded-lg border border-line bg-surface px-4 py-3">
          <a href={`#plan-${encodeURIComponent(pl.path)}`} className="font-medium">
            {pl.title}
          </a>
          <ul className="mt-2 flex flex-col gap-1.5">
            {pl.open.map((t, i) => (
              <li key={i} className="flex gap-2 text-[14px] leading-relaxed">
                <span className="mt-2 size-1.5 flex-none rounded-full bg-faint" aria-hidden />
                <Md className="[&_p]:m-0">{t}</Md>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ProjectDetailView({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["project", id], queryFn: () => api.get<ProjectDetail>(`/projects/${enc(id)}`) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const p = q.data!;
  const of = (k: LibraryItem["kind"]) => p.library.filter((i) => i.kind === k);
  const instructions = of("claude-md");
  const openSections = (p.backlog?.sections ?? []).filter((s) => !/^(done|notes?)\b/i.test(s.name.trim()));
  const openItems = openSections.flatMap((s) => s.items.filter((i) => i.done !== true).map((i) => ({ ...i, section: s.name })));
  const openTasks = openItems.length;
  const planOpen = p.plans.flatMap((pl) => pl.open);
  const sections: { id: string; title: string; count?: number; node: ReactNode; action?: ReactNode }[] = [
    { id: "sessions", title: "Sessions", count: p.sessions.length, node: <SessionRows p={p} /> },
    {
      id: "plans", action: <ActionLink to="/live" search={{ new: "1", project: p.id, mode: "plan" }} label="Plan something" />,
      title: "Plans",
      count: p.plans.length,
      node: p.plans.length ? <div className="flex flex-col gap-2">{p.plans.map((pl, i) => <PlanCard key={pl.path} plan={pl} open={i === 0} />)}</div> : <p className="text-[13.5px] text-muted-foreground">No plans yet. Claude writes one when a session uses plan mode (Shift+Tab in Claude Code).</p>,
    },
    {
      id: "instructions", action: <span className="flex gap-2"><ActionLink to="/live" search={{ new: "1", project: p.id, prompt: "/init" }} label="Have Claude write it" /><NewButton kind="instructions" scope={p.id} label="Write it yourself" /></span>,
      title: "CLAUDE.md",
      count: instructions.length,
      node: instructions.length ? <div className="flex flex-col gap-3">{instructions.map((i) => <MdFile key={i.path} path={i.path} />)}</div> : <p className="text-[13.5px] text-muted-foreground">No CLAUDE.md yet. Run /init in Claude Code to have Claude write one.</p>,
    },
    { id: "skills", action: <NewButton kind="skill" scope={p.id} label="New skill" />, title: "Skills", count: of("skill").length, node: <ItemRows scope={p.id} items={of("skill")} empty="No project skills. Skills in .claude/skills/ appear here." usage={(i) => `/${nameOf(i)}`} /> },
    { id: "agents", action: <NewButton kind="agent" scope={p.id} label="New agent" />, title: "Agents", count: of("agent").length, node: <ItemRows scope={p.id} items={of("agent")} empty="No project agents. Agents in .claude/agents/ appear here." /> },
    { id: "commands", action: <NewButton kind="command" scope={p.id} label="New command" />, title: "Commands", count: of("command").length, node: <ItemRows scope={p.id} items={of("command")} empty="No project commands." usage={(i) => `/${nameOf(i)}`} /> },
    { id: "hooks", action: <ActionLink to="/add" search={{ what: "hook", scope: p.id }} label="New hook" />, title: "Hooks", count: of("hook-def").length + of("hook").length, node: <ItemRows scope={p.id} items={[...of("hook-def"), ...of("hook")]} empty="No hooks in this project." /> },
    { id: "rules", action: <NewButton kind="rule" scope={p.id} label="New rule" />, title: "Rules", count: of("rule").length, node: <ItemRows scope={p.id} items={of("rule")} empty="No rules." /> },
    { id: "memory", action: <NewButton kind="memory" scope={p.id} label="New note" />, title: "Memory", count: p.memory.length, node: <ItemRows scope={p.id} items={p.memory} empty="Claude hasn't saved any notes for this project." /> },
    {
      id: "mcp", action: <ActionLink to="/add" search={{ what: "mcp", scope: p.id }} label="Add server" />,
      title: "MCP servers",
      count: p.mcpServers.servers.length,
      node: p.mcpServers.servers.length ? (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {p.mcpServers.servers.map((s) => (
            <li key={s.name} className="px-4 py-3">
              <span className="font-medium">{s.name}</span> <span className="text-[13px] text-muted-foreground">({s.type})</span>
              <div className="mt-0.5 break-all text-[13px] text-ink-2">{s.runs}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13.5px] text-muted-foreground">{p.mcpServers.error ?? "No MCP servers set up for this project."}</p>
      ),
    },
    { id: "settings", action: <ActionLink to="/add" search={{ what: "permission", scope: p.id }} label="New permission rule" />, title: "Settings", count: of("settings").length, node: <ItemRows scope={p.id} items={of("settings")} empty="No project settings files." /> },
    {
      id: "backlog",
      title: "Backlog",
      count: p.backlog ? openTasks : planOpen.length,
      node: p.backlog ? <BacklogTab p={p} /> : <PlanBacklog p={p} />,
    },
    {
      id: "changelog",
      title: "Changelog",
      node: p.changelog ? <ChangelogTab p={p} /> : <p className="text-[13.5px] text-muted-foreground">No CHANGELOG.md. A changelog lists the notable changes for the people who use the project, newest first. Ask Claude to start one when the project has users.</p>,
    },
    {
      id: "docs",
      title: "Docs",
      count: p.docs.length,
      node: <ItemRows scope={p.id} items={p.docs.map((d) => ({ ...docItem, name: d.name.replace(/\.md$/i, ""), path: d.path, display: d.name }))} empty="No documents at the top of this project." />,
    },
  ];
  return (
    <div className="flex min-h-full flex-col">
      <DetailHeader
        title={p.name}
        sub={
          <span>
            {p.path}
            {p.git?.branch ? ` · branch ${p.git.branch}${p.git.dirty ? `, ${p.git.dirty} changed files` : ""}` : ""}
          </span>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => openOnComputer(p.abs, false).then(() => {}, (e) => toast.error(e.message))}>
              Open folder
            </Button>
            <Button asChild className="no-underline">
              <Link to="/live" search={{ new: "1", project: p.id }}>
                New session here
              </Link>
            </Button>
          </>
        }
      />
      <div className="flex gap-8 px-6 md:pl-12">
        <div className="min-w-0 max-w-[860px] flex-1">
          {sections.map((s) => (
            <Section key={s.id} id={s.id} title={s.title} action={s.action}>
              {s.node}
            </Section>
          ))}
        </div>
        <nav aria-label="On this page" className="sticky top-4 hidden h-fit w-48 flex-none py-6 xl:block">
          <ul className="flex flex-col gap-0.5 text-[13.5px]">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="flex justify-between rounded px-2 py-1 text-ink-2 no-underline hover:bg-sunken">
                  {s.title}
                  {s.count !== undefined && <span className="text-muted-foreground">{s.count}</span>}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

export function ProjectsPage() {
  const params = useParams({ strict: false }) as { id?: string };
  const id = params.id ? decodeURIComponent(params.id) : null;
  return <div className="h-full overflow-auto">{id ? <ProjectDetailView key={id} id={id} /> : <ProjectOverview />}</div>;
}
