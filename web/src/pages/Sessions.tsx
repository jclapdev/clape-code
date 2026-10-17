import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Archive, ArchiveRestore, Copy, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { compact, dayGroup, modelName, money, plural, when } from "@/lib/format";
import { copy } from "@/lib/resume";
import type { Project, Session, Turn } from "@/lib/types";
import { DetailHeader, TwoPane } from "@/components/Panes";
import { Transcript } from "@/components/Transcript";
import { Button, cn, Dialog, Empty, ErrorNote, Spinner, Tag, useConfirm, useToast } from "@/components/ui";

type Search = { archived?: string; project?: string };

function useSessionActions() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const archive = useMutation({
    mutationFn: ({ ids, archived }: { ids: string[]; archived: boolean }) => api.post("/sessions/archive", { ids, archived }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["session"] });
      toast({ tone: "ok", text: v.archived ? `Archived ${v.ids.length === 1 ? "the session" : `${v.ids.length} sessions`}. They can still be resumed.` : "Moved back to your sessions." });
    },
    onError: (e: Error) => toast({ tone: "danger", text: e.message }),
  });
  const del = useMutation({
    mutationFn: (ids: string[]) => api.post<{ deleted: string[]; skipped: { id: string; reason: string }[] }>("/sessions/delete", { ids }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast({ tone: r.skipped.length ? "danger" : "ok", text: `Moved ${r.deleted.length} to the trash.${r.skipped.length ? ` Skipped ${r.skipped.length} that are still running.` : ""}` });
    },
    onError: (e: Error) => toast({ tone: "danger", text: e.message }),
  });
  const askDelete = async (ids: string[]) =>
    (await confirm({
      title: ids.length === 1 ? "Delete this session?" : `Delete ${ids.length} sessions?`,
      body: "The transcripts move to your computer's trash, where you can still recover them. Deleted sessions can't be resumed. Archive instead if you only want them out of the list.",
      confirm: "Move to trash",
      danger: true,
    })) && del.mutate(ids);
  return { archive, del, askDelete };
}

function SessionList({ selected, search }: { selected: string | null; search: Search }) {
  const navigate = useNavigate();
  const archivedView = search.archived === "1";
  const [empty, setEmpty] = useState(false);
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const q = useQuery({
    queryKey: ["sessions", archivedView, empty, search.project ?? ""],
    queryFn: () => api.get<Session[]>(`/sessions?archived=${archivedView ? 1 : 0}&empty=${empty ? 1 : 0}${search.project ? `&project=${encodeURIComponent(search.project)}` : ""}`),
  });
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/projects") });
  const { archive, askDelete } = useSessionActions();

  const f = filter.toLowerCase();
  const list = (q.data ?? []).filter((s) => !f || s.displayTitle.toLowerCase().includes(f) || (s.cwd ?? "").toLowerCase().includes(f));
  const groups = useMemo(() => {
    const m = new Map<string, Session[]>();
    for (const s of list) {
      const g = dayGroup(s.lastAt);
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(s);
    }
    return [...m];
  }, [list]);

  const toggle = (id: string) => setPicked((p) => (p.has(id) ? (p.delete(id), new Set(p)) : new Set(p.add(id))));
  const pickOlder = (days: number) => {
    const cut = Date.now() - days * 86400000;
    setPicked(new Set(list.filter((s) => !s.running && s.lastAt && new Date(s.lastAt).getTime() < cut).map((s) => s.sessionId)));
  };
  const ids = [...picked];
  const setSearch = (patch: Partial<Search>) => navigate({ to: "/sessions", search: { ...search, ...patch } });

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex flex-col gap-2 bg-panel px-4 pb-2 pt-4">
        <div className="flex gap-2">
          <label htmlFor="sp" className="sr-only">
            Project
          </label>
          <select id="sp" value={search.project ?? ""} onChange={(e) => setSearch({ project: e.target.value || undefined })} className="h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2 text-[13.5px]">
            <option value="">All projects</option>
            {(projects.data ?? [])
              .filter((p) => p.sessions > 0)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <Button size="sm" className="h-9" onClick={() => setSearch({ archived: archivedView ? undefined : "1" })} aria-pressed={archivedView}>
            {archivedView ? "Back to sessions" : "Archived"}
          </Button>
        </div>
        <label htmlFor="sf" className="sr-only">
          Filter sessions
        </label>
        <input id="sf" data-filter value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by title or folder  /" className="h-9 rounded-md border border-line-strong bg-surface px-3 outline-none focus:border-accent" />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
          <span>Select:</span>
          <button type="button" className="hover:text-accent" onClick={() => pickOlder(30)}>
            older than 30 days
          </button>
          <button type="button" className="hover:text-accent" onClick={() => pickOlder(7)}>
            older than 7 days
          </button>
          {picked.size > 0 && (
            <button type="button" className="hover:text-accent" onClick={() => setPicked(new Set())}>
              none
            </button>
          )}
          <label className="ml-auto flex items-center gap-1.5">
            <input type="checkbox" checked={empty} onChange={(e) => setEmpty(e.target.checked)} /> show empty
          </label>
        </div>
        {picked.size > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-accent-line bg-accent-soft px-2.5 py-1.5">
            <span className="flex-1 text-[13px] font-medium text-accent-strong">{picked.size} selected</span>
            <Button size="sm" onClick={() => archive.mutate({ ids, archived: !archivedView }, { onSuccess: () => setPicked(new Set()) })}>
              {archivedView ? "Unarchive" : "Archive"}
            </Button>
            <Button size="sm" variant="danger" onClick={() => askDelete(ids).then(() => setPicked(new Set()))}>
              Delete
            </Button>
          </div>
        )}
      </div>
      {q.isLoading && <Spinner />}
      <ErrorNote error={q.error} />
      {!q.isLoading && !list.length && <p className="px-5 py-4 text-muted">{archivedView ? "No archived sessions." : "No sessions match."}</p>}
      {groups.map(([g, ss]) => (
        <div key={g} className="px-2 pb-1">
          <div className="px-2.5 pb-1 pt-3 text-xs font-medium text-muted">{g}</div>
          {ss.map((s) => (
            <div key={s.sessionId} className={cn("group flex items-start gap-2 rounded-md px-1.5 hover:bg-sunken", selected === s.sessionId && "bg-surface shadow-[0_0_0_1px_var(--line-strong)]")}>
              <input
                type="checkbox"
                aria-label={`Select ${s.displayTitle}`}
                checked={picked.has(s.sessionId)}
                onChange={() => toggle(s.sessionId)}
                className={cn("mt-3 size-4 flex-none accent-[var(--accent)]", !picked.size && "opacity-0 focus:opacity-100 group-hover:opacity-100")}
              />
              <Link to="/sessions/$sid" params={{ sid: s.sessionId }} search={search} className="flex min-w-0 flex-1 flex-col gap-0.5 py-2 text-ink no-underline">
                <span className="flex items-center gap-2">
                  <span className={cn("min-w-0 flex-1 truncate text-[14px]", s.title ? "font-medium" : "text-ink-2")}>{s.displayTitle}</span>
                  {s.running && <Tag tone="accent">Running</Tag>}
                </span>
                <span className="flex gap-2 text-xs text-muted">
                  <span className="truncate">{s.project?.split("/").pop() ?? s.cwd}</span>
                  <span className="ml-auto flex-none">{when(s.lastAt)}</span>
                </span>
              </Link>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SubagentDialog({ sid, agent, onClose }: { sid: string; agent: { agentId: string; type: string | null; description: string | null } | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["session", sid, "sub", agent?.agentId],
    queryFn: () => api.get<{ turns: Turn[] }>(`/sessions/${sid}/subagents/${agent!.agentId}`),
    enabled: !!agent,
  });
  return (
    <Dialog open={!!agent} onClose={onClose} title={`${agent?.type ?? "Subagent"}: ${agent?.description ?? ""}`} wide>
      {q.isLoading ? <Spinner /> : q.error ? <ErrorNote error={q.error} /> : <Transcript turns={q.data?.turns ?? []} />}
    </Dialog>
  );
}

function SessionDetail({ sid, search }: { sid: string; search: Search }) {
  const q = useQuery({ queryKey: ["session", sid], queryFn: () => api.get<Session & { turns: Turn[]; subagentList: { agentId: string; type: string | null; description: string | null }[] }>(`/sessions/${sid}`) });
  const [mine, setMine] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [raw, setRaw] = useState(false);
  const [sub, setSub] = useState<{ agentId: string; type: string | null; description: string | null } | null>(null);
  const toast = useToast();
  const navigate = useNavigate();
  const { archive, askDelete } = useSessionActions();
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorNote error={q.error} />;
  const s = q.data!;
  const prompts = s.turns.filter((t) => t.role === "user").length;
  const tokens = s.usage.input + s.usage.output + s.usage.cacheRead + s.usage.cacheWrite;

  const jumpPrompt = (dir: 1 | -1) => {
    const els = [...document.querySelectorAll<HTMLElement>("[data-prompt]")];
    const top = (document.querySelector("[data-transcript-scroll]") as HTMLElement | null)?.getBoundingClientRect().top ?? 0;
    const next = dir === 1 ? els.find((e) => e.getBoundingClientRect().top > top + 80) : [...els].reverse().find((e) => e.getBoundingClientRect().top < top - 10);
    next?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex min-h-full flex-col" data-transcript-scroll>
      <DetailHeader
        title={s.displayTitle}
        sub={
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            <span className="font-mono">{s.cwd}</span>
            {s.model && <span>{modelName(s.model)}</span>}
            <span>{when(s.firstAt)}</span>
            <span>{compact(tokens)} tokens</span>
            {s.costUSD != null && <span>{money(s.costUSD)}</span>}
          </span>
        }
        actions={
          <>
            <Button size="sm" onClick={() => copy(s.resumeCommand).then((ok) => toast({ tone: ok ? "ok" : "danger", text: ok ? "Resume command copied." : s.resumeCommand }))}>
              <Copy className="size-3.5" aria-hidden /> Copy resume command
            </Button>
            {!s.running && (
              <Link to="/live" search={{ new: "1", resume: s.sessionId }} className="inline-flex h-8 items-center rounded-md border border-accent bg-accent px-2.5 text-[13px] font-medium text-on-accent no-underline hover:bg-accent-strong">
                Resume here
              </Link>
            )}
            <Button size="sm" variant="ghost" aria-label={s.archivedAt ? "Unarchive" : "Archive"} title={s.archivedAt ? "Unarchive" : "Archive"} onClick={() => archive.mutate({ ids: [s.sessionId], archived: !s.archivedAt })}>
              {s.archivedAt ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            </Button>
            {!s.running && (
              <Button
                size="sm"
                variant="ghost"
                aria-label="Delete"
                title="Delete"
                onClick={() => askDelete([s.sessionId]).then(() => navigate({ to: "/sessions", search }))}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {[
            ["My prompts only", mine, setMine],
            ["Show thinking", thinking, setThinking],
            ["Raw JSON", raw, setRaw],
          ].map(([label, on, set]) => (
            <button
              key={label as string}
              type="button"
              aria-pressed={on as boolean}
              onClick={() => (set as (v: boolean) => void)(!(on as boolean))}
              className={cn("h-8 rounded-full border px-3 text-[12.5px]", on ? "border-accent-line bg-accent-soft text-accent-strong" : "border-line-strong text-ink-2 hover:bg-sunken")}
            >
              {label as string}
            </button>
          ))}
          {s.subagentList.length > 0 && (
            <select
              aria-label="Open a subagent run"
              value=""
              onChange={(e) => setSub(s.subagentList.find((a) => a.agentId === e.target.value) ?? null)}
              className="h-8 rounded-full border border-line-strong bg-surface px-3 text-[12.5px] text-ink-2"
            >
              <option value="">Subagent runs ({s.subagentList.length})</option>
              {s.subagentList.map((a) => (
                <option key={a.agentId} value={a.agentId}>
                  {a.type}: {a.description}
                </option>
              ))}
            </select>
          )}
          <span className="ml-auto flex items-center gap-2 text-[12.5px] text-muted">
            {plural(prompts, "prompt")}
            <Button size="sm" variant="ghost" onClick={() => jumpPrompt(-1)} aria-label="Previous prompt">
              ↑
            </Button>
            <Button size="sm" variant="ghost" onClick={() => jumpPrompt(1)} aria-label="Next prompt">
              ↓
            </Button>
          </span>
        </div>
      </DetailHeader>
      <div className="mx-auto w-full max-w-[880px] px-6 py-5 md:pl-12">
        {raw ? <pre className="overflow-auto rounded-md bg-sunken p-3 font-mono text-xs">{JSON.stringify(s.turns, null, 2)}</pre> : <Transcript turns={s.turns} mineOnly={mine} showThinking={thinking} />}
        <p className="mt-6 text-center text-xs text-muted">Transcripts belong to Claude Code and are shown read-only.</p>
      </div>
      <SubagentDialog sid={sid} agent={sub} onClose={() => setSub(null)} />
    </div>
  );
}

export function SessionsPage() {
  const { sid } = useParams({ strict: false }) as { sid?: string };
  const search = useSearch({ strict: false }) as Search;
  const navigate = useNavigate();
  return (
    <TwoPane
      id="sessions"
      listLabel="Sessions"
      hasSelection={!!sid}
      onBack={() => navigate({ to: "/sessions", search })}
      list={<SessionList selected={sid ?? null} search={search} />}
      detail={sid ? <SessionDetail key={sid} sid={sid} search={search} /> : <Empty title="Pick a session">Its conversation opens here, with tool calls folded away until you need them.</Empty>}
    />
  );
}
