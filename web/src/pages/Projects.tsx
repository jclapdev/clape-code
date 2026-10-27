import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowRight, ChevronDown, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api, enc } from "@/lib/api";
import { plural, when } from "@/lib/format";
import type { Catalog, LibraryItem, Project, ProjectDetail } from "@/lib/types";
import { featureById, type Feature, type FeatureId } from "@/lib/features";
import { ProjectBoard } from "./ProjectBoard";
import { ContextDropZone, ContextSection } from "./ProjectContext";
import { openOnComputer } from "@/components/FileEditor";
import { ItemActions } from "@/components/ItemActions";
import { DetailHeader, PAGE_COLUMN, PAGE_SCROLL } from "@/components/Panes";
import { Readable } from "@/components/Readable";
import type { NewKind } from "./NewItem";
import { ErrorNote, Loading, Md, Tag, cn } from "@/components/ui";
import { SimpleSelect } from "@/components/SimpleSelect";

function ProjectOverview() {
  const q = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/projects") });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const mine = (q.data ?? []).filter((p) => p.group === "root");
  return (
    <div className={`${PAGE_COLUMN} py-6`}>
      <h1 className="text-[24px] font-semibold tracking-[-0.01em]">Projects</h1>
      <div className="mt-6 grid auto-rows-fr gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
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
                    <div className="mb-4">
                      <ItemActions i={i} scope={scope} projectId={scope === "global" ? null : scope} />
                    </div>
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
  if (!p.sessions.length) return <p className="text-[13.5px] text-muted-foreground">No sessions yet. Press "New session" to give Claude a task in this project.</p>;
  const plansBy = new Map<string, ProjectDetail["plans"]>();
  for (const pl of p.plans) plansBy.set(pl.sessionId, [...(plansBy.get(pl.sessionId) ?? []), pl]);
  const shown = p.sessions.slice(0, 5);
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
                <Link to="/sessions/$sid" params={{ sid: s.sessionId }}>
                  Continue
                </Link>
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Link to="/sessions" search={{ project: p.id }} className="mt-2 inline-flex items-center gap-1 text-[13px]">
        All sessions
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
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
export function ActionLink({ to, search, label, primary }: { to: "/add" | "/sessions/new"; search: Record<string, string>; label: string; primary?: boolean }) {
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

/** What you build in a project, each with how many it has, what it is in one line, and a New button that creates it in this project. */
const BUILD: { id: FeatureId; line: string }[] = [
  { id: "instructions", line: "Rules Claude follows in every session" },
  { id: "skills", line: "Procedures Claude runs on request or by itself" },
  { id: "agents", line: "Helpers that take on a side task and report back" },
  { id: "hooks", line: "Commands that run on their own, such as after every edit" },
  { id: "mcp", line: "Connections to GitHub, databases and other services" },
  { id: "output-styles", line: "How long and in what format Claude answers" },
];
// Made by Claude rather than built by you, so they keep a plain count.
const MADE_BY_CLAUDE: FeatureId[] = ["plans", "memory", "workflows"];

function BuildCards({ p }: { p: ProjectDetail }) {
  const cat = useQuery({ queryKey: ["catalog"], queryFn: () => api.get<Catalog>("/catalog") });
  const mine = (cat.data?.items ?? []).filter((i) => i.projectId === p.id);
  const count = (f: Feature) => (cat.isLoading ? "…" : mine.filter((i) => f.kinds.includes(i.kind)).length || "none");
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid auto-rows-fr gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))]">
        {BUILD.map(({ id, line }) => {
          const f = featureById(id)!;
          const Icon = f.icon;
          const n = count(f);
          return (
            <li key={id} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
              <div className="flex items-center gap-2">
                <Icon aria-hidden className="size-4 flex-none text-muted-foreground" />
                <Link to={`/${f.id}` as "/skills"} search={{ project: p.id }} className="min-w-0 flex-1 truncate font-semibold text-ink no-underline hover:underline">
                  {f.label}
                </Link>
                <span className={cn("text-[13px] tabular-nums", n === "none" ? "text-muted-foreground" : "font-semibold")}>{n}</span>
              </div>
              <p className="flex-1 text-[13.5px] text-ink-2">{line}</p>
              {f.create && (
                <Button asChild size="sm" variant="outline" className="self-start no-underline">
                  <Link to={f.create.to} search={{ ...f.create.search, scope: p.id } as never}>
                    {f.create.label}
                  </Link>
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <ul className="flex flex-wrap gap-2">
        {MADE_BY_CLAUDE.map((id) => {
          const f = featureById(id)!;
          const Icon = f.icon;
          return (
            <li key={id}>
              <Link to={`/${f.id}` as "/skills"} search={{ project: p.id }} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] text-ink no-underline hover:border-line-strong">
                <Icon aria-hidden className="size-4 flex-none text-muted-foreground" />
                {f.label}
                <span className="font-semibold tabular-nums">{count(f)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function WorktreeInclude({ p }: { p: ProjectDetail }) {
  const w = p.worktreeInclude;
  if (!w.exists)
    return (
      <p className="text-[13.5px] text-muted-foreground">
        No .worktreeinclude. It lists files git ignores, such as .env, that Claude Code copies into each new worktree it makes for this project. It uses the same patterns as .gitignore.
      </p>
    );
  return (
    <div className="flex flex-col gap-2">
      {w.patterns.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {w.patterns.map((pt) => (
            <li key={pt}>
              <code className="rounded bg-sunken px-1.5 py-0.5 text-[12.5px]">{pt}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13.5px] text-muted-foreground">It's empty, so nothing extra is copied into new worktrees.</p>
      )}
      <Link to="/file" search={{ path: w.path }} className="text-[13px]">
        Edit .worktreeinclude
      </Link>
    </div>
  );
}

function ProjectDetailView({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["project", id], queryFn: () => api.get<ProjectDetail>(`/projects/${enc(id)}`) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const p = q.data!;
  return (
    <ContextDropZone p={p}>
      <DetailHeader
        title={p.name}
        sub={
          <span className="break-all">
            {p.path}
            {p.git?.branch ? ` · branch ${p.git.branch}${p.git.dirty ? `, ${plural(p.git.dirty, "changed file")}` : ""}` : ""}
          </span>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => openOnComputer(p.abs, false).then(() => {}, (e) => toast.error(e.message))}>
              Open folder
            </Button>
            <Button asChild className="no-underline">
              <Link to="/sessions/new" search={{ project: p.id }}>
                New session
              </Link>
            </Button>
          </>
        }
      />
      <div className={PAGE_COLUMN}>
        <Section id="board" title="Board">
          <ProjectBoard p={p} />
        </Section>
        <Section id="customize" title="Build your setup">
          <BuildCards p={p} />
        </Section>
        <Section id="sessions" title="Recent sessions">
          <SessionRows p={p} />
        </Section>
        <Section id="context" title="Context for Claude">
          <ContextSection p={p} />
        </Section>
        <Section id="changelog" title="Changelog">
          {p.changelog ? <ChangelogTab p={p} /> : <p className="text-[13.5px] text-muted-foreground">No CHANGELOG.md. A changelog lists the notable changes for the people who use the project, newest first. Ask Claude to start one when the project has users.</p>}
        </Section>
        <Section id="docs" title="Docs">
          <ItemRows scope={p.id} items={p.docs.map((d) => ({ ...docItem, name: d.name.replace(/\.md$/i, ""), path: d.path, display: d.name }))} empty="No documents at the top of this project." />
        </Section>
        <Section id="worktreeinclude" title=".worktreeinclude">
          <WorktreeInclude p={p} />
        </Section>
      </div>
    </ContextDropZone>
  );
}

export function ProjectsPage() {
  const params = useParams({ strict: false }) as { id?: string };
  const id = params.id ? decodeURIComponent(params.id) : null;
  return <div className={PAGE_SCROLL}>{id ? <ProjectDetailView key={id} id={id} /> : <ProjectOverview />}</div>;
}
