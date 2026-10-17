import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Check, Pencil, Plus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { api, ApiError, enc } from "@/lib/api";
import { when } from "@/lib/format";
import type { BacklogItem, Project, ProjectDetail } from "@/lib/types";
import { FileEditor, fileQuery, openOnComputer } from "@/components/FileEditor";
import { DetailHeader, ListGroup, TwoPane } from "@/components/Panes";
import { Button, cn, Empty, ErrorNote, Md, Spinner, Tag, useToast } from "@/components/ui";
import { LibraryList } from "./Library";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "backlog", label: "Backlog" },
  { id: "changelog", label: "Changelog" },
  { id: "docs", label: "Docs" },
  { id: "config", label: "Config" },
  { id: "sessions", label: "Sessions" },
] as const;

function ProjectList({ selected }: { selected: string | null }) {
  const q = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/projects") });
  const [filter, setFilter] = useState("");
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorNote error={q.error} />;
  const f = filter.toLowerCase();
  const list = (q.data ?? []).filter((p) => !f || p.name.toLowerCase().includes(f) || p.path.toLowerCase().includes(f));
  const groups: [string, Project[]][] = [
    ["Your projects", list.filter((p) => p.group === "root" && !p.empty)],
    ["Other folders with Claude sessions", list.filter((p) => p.group === "other")],
    ["Empty folders", list.filter((p) => p.empty && p.group === "root")],
  ];
  return (
    <div className="pb-6">
      <div className="sticky top-0 z-10 bg-panel px-4 pb-2 pt-4">
        <label htmlFor="pf" className="sr-only">
          Filter projects
        </label>
        <input id="pf" data-filter value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter projects  /" className="h-9 w-full rounded-md border border-line-strong bg-surface px-3 outline-none focus:border-accent" />
      </div>
      {groups.map(([label, ps]) =>
        ps.length ? (
          <ListGroup key={label} label={label}>
            {ps.map((p) => (
              <Link
                key={p.id}
                to="/projects/$id"
                params={{ id: p.id }}
                search={{}}
                className={cn("flex flex-col gap-0.5 rounded-md px-2.5 py-2 text-ink no-underline hover:bg-sunken", selected === p.id && "bg-surface shadow-[0_0_0_1px_var(--line-strong)]")}
              >
                <span className="flex items-center gap-2">
                  <span className="flex-1 truncate text-[14px] font-medium">{p.name}</span>
                  {p.backlog && p.backlog.open > 0 && <span className="text-xs text-muted">{p.backlog.open} open</span>}
                </span>
                <span className="flex gap-2 text-xs text-muted">
                  {p.git ? <span className="font-mono">{p.git.branch}{p.git.dirty ? ` +${p.git.dirty}` : ""}</span> : p.group === "other" ? <span className="truncate font-mono">{p.path}</span> : <span>No git</span>}
                  {p.sessions > 0 && <span className="ml-auto">{when(p.lastSessionAt)}</span>}
                </span>
              </Link>
            ))}
          </ListGroup>
        ) : null,
      )}
    </div>
  );
}

function BacklogTab({ p }: { p: ProjectDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState<number | null>(null);
  const b = p.backlog;

  const run = useMutation({
    mutationFn: ({ op, body }: { op: string; body: object }) => api.post(`/projects/${enc(p.id)}/backlog/${op}`, { ...body, hash: b!.hash }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", p.id] }),
    onError: (e: Error) => {
      toast({ tone: "danger", text: e instanceof ApiError && e.status === 409 ? "BACKLOG.md changed on disk. It has been reloaded; try again." : e.message });
      qc.invalidateQueries({ queryKey: ["project", p.id] });
    },
  });

  if (!b) {
    return (
      <Empty title="No BACKLOG.md in this project">
        A backlog is a markdown file of things left to do. Create <span className="font-mono">BACKLOG.md</span> in the project folder and it appears here.
      </Empty>
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
          {b.checkboxes && <span className="text-muted">{done} of {all.length} done.</span>}
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
              {b.checkboxes && s.items.length > 0 && <span className="text-xs text-muted">{sd} of {s.items.length} done</span>}
            </div>
            {s.intro && <p className="pb-2 text-[13px] text-muted">{s.intro}</p>}
            <ul>
              {s.items.map((it) => (
                <li key={it.line} className="group flex items-start gap-3 border-t border-line py-2">
                  {it.done !== null ? (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={it.done}
                      aria-label={`Mark ${it.n ?? ""} ${it.done ? "not done" : "done"}`}
                      onClick={() => toggle(it)}
                      className={cn("mt-0.5 grid size-[18px] flex-none place-items-center rounded border", it.done ? "border-accent bg-accent text-on-accent" : "border-line-strong bg-surface hover:border-accent")}
                    >
                      {it.done && <Check className="size-3" strokeWidth={3} />}
                    </button>
                  ) : (
                    <span className="mt-2 size-1.5 flex-none rounded-full bg-faint" aria-hidden />
                  )}
                  {it.n !== null && <span className="w-6 flex-none pt-px font-mono text-[12.5px] text-muted">{it.n}.</span>}
                  {editing === it.line ? (
                    <form
                      className="flex flex-1 gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        run.mutate({ op: "edit", body: { line: it.line, text: draft } });
                        setEditing(null);
                      }}
                    >
                      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setEditing(null)} className="h-8 flex-1 rounded border border-accent bg-surface px-2 outline-none" aria-label="Item text" />
                      <Button size="sm" type="submit" variant="primary">
                        Save
                      </Button>
                    </form>
                  ) : (
                    <>
                      <span className={cn("flex-1 leading-relaxed", it.done && "text-muted")}>
                        <Md className="[&_p]:m-0">{it.text}</Md>
                      </span>
                      <button
                        type="button"
                        aria-label="Edit item"
                        onClick={() => {
                          setEditing(it.line);
                          setDraft(it.text);
                        }}
                        className="invisible grid size-7 flex-none place-items-center rounded text-muted hover:bg-sunken group-hover:visible focus:visible"
                      >
                        <Pencil className="size-3.5" />
                      </button>
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
                <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setAdding(null)} placeholder="What needs doing?" className="h-8 flex-1 rounded border border-accent bg-surface px-2 outline-none" aria-label="New item" />
                <Button size="sm" type="submit" variant="primary">
                  Add
                </Button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAdding(s.line);
                  setDraft("");
                }}
                className="flex h-9 w-full items-center gap-1.5 border-t border-line text-[13px] text-muted hover:text-accent"
              >
                <Plus className="size-3.5" aria-hidden /> Add item
              </button>
            )}
          </section>
        );
      })}
      <p className="text-xs text-muted">Changes edit only the line you touch. Every save keeps the previous file as a backup.</p>
    </div>
  );
}

function ChangelogTab({ p }: { p: ProjectDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState("");
  const c = p.changelog;
  const add = useMutation({
    mutationFn: () => api.post(`/projects/${enc(p.id)}/changelog`, { text, hash: c!.hash }),
    onSuccess: () => {
      setText("");
      toast({ tone: "ok", text: "Added to today's changes." });
      qc.invalidateQueries({ queryKey: ["project", p.id] });
    },
    onError: (e: Error) => toast({ tone: "danger", text: e.message }),
  });
  if (!c) return <Empty title="No CHANGELOG.md in this project">Create <span className="font-mono">CHANGELOG.md</span> with dated sections and it appears here.</Empty>;
  return (
    <div className="flex flex-col gap-4 p-6 md:pl-12">
      <form
        className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) add.mutate();
        }}
      >
        <label htmlFor="cl" className="text-[13px] font-medium">
          Add a change for today
        </label>
        <textarea id="cl" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="What changed, in a sentence the reader will understand." className="resize-y rounded-md border border-line-strong bg-surface p-2.5 outline-none focus:border-accent" />
        <div className="flex justify-between">
          <Link to="/file" search={{ path: c.path }} className="self-center text-[13px]">
            Edit as text
          </Link>
          <Button type="submit" variant="primary" size="sm" busy={add.isPending} disabled={!text.trim()}>
            Add to today
          </Button>
        </div>
      </form>
      {c.days.map((d) => (
        <section key={d.line}>
          <h3 className="mb-2 text-[14px] font-semibold">{d.date}</h3>
          <ul className="flex flex-col gap-1.5 border-l-2 border-line pl-4">
            {d.entries.map((e, i) => (
              <li key={i}>
                <Md className="[&_p]:m-0">{e}</Md>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function DocsTab({ p }: { p: ProjectDetail }) {
  const docs = p.docs;
  const [sel, setSel] = useState<string | null>(docs.find((d) => d.name === "README.md")?.path ?? docs[0]?.path ?? null);
  if (!docs.length) return <Empty title="No markdown files at the top of this project" />;
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1.5 border-b border-line px-6 py-2 md:pl-12">
        {docs.map((d) => (
          <button key={d.path} type="button" onClick={() => setSel(d.path)} aria-pressed={sel === d.path} className={cn("h-8 rounded-md px-2.5 font-mono text-[12.5px]", sel === d.path ? "bg-accent-soft text-accent-strong" : "text-ink-2 hover:bg-sunken")}>
            {d.name}
          </button>
        ))}
      </div>
      <div className="min-h-[480px] flex-1">{sel && <FileEditor path={sel} />}</div>
    </div>
  );
}

function OverviewTab({ p }: { p: ProjectDetail }) {
  const readme = (p.docs).find((d) => d.name === "README.md");
  const r = useQuery({ ...fileQuery(readme?.path ?? ""), enabled: !!readme });
  const stats: [string, string][] = [
    ["Sessions", p.sessions.length >= 100 ? "100+" : String(p.sessions.length)],
    ["Last session", when(p.lastSessionAt) || "Never"],
    ["Backlog", p.backlog ? `${p.backlog.sections.flatMap((s) => s.items).filter((i) => i.done === false).length} open` : "None"],
    ["Git", p.git ? `${p.git.branch}${p.git.dirty ? `, ${p.git.dirty} changed files` : ", clean"}` : "Not a repository"],
  ];
  return (
    <div className="flex flex-col gap-5 p-6 md:pl-12">
      <dl className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line bg-surface px-4 py-3">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="mt-1 font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {p.git?.remote && (
        <p className="text-[13px] text-muted">
          Remote <span className="font-mono">{p.git.remote}</span>, last commit {when(p.git.lastCommitAt)}
        </p>
      )}
      {p.worktrees.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">Worktrees</h3>
          <ul className="flex flex-col gap-1">
            {p.worktrees.map((w) => (
              <li key={w.path} className="font-mono text-[13px] text-ink-2">
                {w.name}
              </li>
            ))}
          </ul>
        </section>
      )}
      {readme && r.data?.content && (
        <section className="rounded-lg border border-line bg-surface p-5">
          <Md>{r.data.content}</Md>
        </section>
      )}
    </div>
  );
}

function SessionsTab({ p }: { p: ProjectDetail }) {
  if (!p.sessions.length) return <Empty title="No sessions in this project yet" />;
  return (
    <ul className="p-4 md:pl-10">
      {p.sessions.map((s) => (
        <li key={s.sessionId}>
          <Link to="/sessions/$sid" params={{ sid: s.sessionId }} search={{}} className="flex items-center gap-3 rounded-md px-3 py-2 text-ink no-underline hover:bg-sunken">
            <span className="min-w-0 flex-1 truncate">{s.displayTitle}</span>
            {s.worktree && <Tag>worktree</Tag>}
            {s.running && <Tag tone="accent">Running</Tag>}
            <span className="w-20 text-right text-xs text-muted">{when(s.lastAt)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ProjectDetailView({ id, tab }: { id: string; tab: string }) {
  const q = useQuery({ queryKey: ["project", id], queryFn: () => api.get<ProjectDetail>(`/projects/${enc(id)}`) });
  const navigate = useNavigate();
  const toast = useToast();
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorNote error={q.error} />;
  const p = q.data!;
  return (
    <div className="flex min-h-full flex-col">
      <DetailHeader
        title={p.name}
        sub={
          <span className="font-mono">
            {p.path}
            {p.git?.branch ? ` on ${p.git.branch}` : ""}
          </span>
        }
        actions={
          <>
            <Button size="sm" onClick={() => openOnComputer(p.abs, false).then(() => {}, (e) => toast({ tone: "danger", text: e.message }))}>
              Open folder
            </Button>
            <Link to="/live" search={{ new: "1", project: p.id }} className="inline-flex h-8 items-center rounded-md border border-accent bg-accent px-2.5 text-[13px] font-medium text-on-accent no-underline hover:bg-accent-strong">
              New session here
            </Link>
          </>
        }
      >
        <nav aria-label="Project" className="-mb-4 flex gap-5 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => navigate({ to: "/projects/$id", params: { id }, search: { tab: t.id }, replace: true })}
              aria-current={tab === t.id ? "page" : undefined}
              className={cn("border-b-2 pb-2.5 text-[14px]", tab === t.id ? "border-accent font-semibold text-ink" : "border-transparent text-muted hover:text-ink")}
            >
              {t.label}
              {t.id === "backlog" && p.backlog && <span className="ml-1.5 text-xs text-muted">{p.backlog.sections.flatMap((s) => s.items).filter((i) => i.done === false).length || ""}</span>}
              {t.id === "sessions" && <span className="ml-1.5 text-xs text-muted">{p.sessions.length || ""}</span>}
            </button>
          ))}
        </nav>
      </DetailHeader>
      <div className="flex-1">
        {tab === "overview" && <OverviewTab p={p} />}
        {tab === "backlog" && <BacklogTab p={p} />}
        {tab === "changelog" && <ChangelogTab p={p} />}
        {tab === "docs" && <DocsTab p={p} />}
        {tab === "config" && (
          <div className="p-4 md:pl-10">
            <LibraryList items={p.library} scope={p.id} emptyText="This project has no .claude folder items yet." />
          </div>
        )}
        {tab === "sessions" && <SessionsTab p={p} />}
      </div>
    </div>
  );
}

export function ProjectsPage() {
  const params = useParams({ strict: false }) as { id?: string };
  const search = useSearch({ strict: false }) as { tab?: string };
  const navigate = useNavigate();
  const id = params.id ? decodeURIComponent(params.id) : null;
  const tab = useMemo(() => search.tab ?? "overview", [search.tab]);
  return (
    <TwoPane
      id="projects"
      listLabel="Projects"
      hasSelection={!!id}
      onBack={() => navigate({ to: "/projects" })}
      list={<ProjectList selected={id} />}
      detail={id ? <ProjectDetailView id={id} tab={tab} /> : <Empty title="Pick a project">Its backlog, changelog, docs and Claude configuration open here.</Empty>}
    />
  );
}
