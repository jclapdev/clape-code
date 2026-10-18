import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Archive, ArchiveRestore, ChevronDown, Copy, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { compact, dayGroup, modelName, money, plural, when } from "@/lib/format";
import { copy } from "@/lib/resume";
import type { Project, Session, Turn } from "@/lib/types";
import { DetailHeader, TwoPane } from "@/components/Panes";
import { Transcript } from "@/components/Transcript";
import { EmptyState, ErrorNote, Loading, Tag, cn, useConfirm } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { SimpleSelect } from "@/components/SimpleSelect";
import { IconButton } from "@/components/IconButton";

type Search = { archived?: string; project?: string };

const TURNS_PER_PAGE = 200;

function useSessionActions() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const archive = useMutation({
    mutationFn: ({ ids, archived }: { ids: string[]; archived: boolean }) => api.post("/sessions/archive", { ids, archived }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["session"] });
      toast.success(v.archived ? `Archived ${v.ids.length === 1 ? "the session" : `${v.ids.length} sessions`}. They can still be resumed.` : "Moved back to your sessions.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (ids: string[]) => api.post<{ deleted: string[]; skipped: { id: string; reason: string }[] }>("/sessions/delete", { ids }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      (r.skipped.length ? toast.error : toast.success)(`Moved ${r.deleted.length} to the trash.${r.skipped.length ? ` Skipped ${r.skipped.length} that are still running.` : ""}`);
    },
    onError: (e: Error) => toast.error(e.message),
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
          <SimpleSelect
            label="Project"
            value={search.project ?? ""}
            onChange={(v) => setSearch({ project: v || undefined })}
            className="min-w-0 flex-1"
            options={[{ value: "", label: "All projects" }, ...(projects.data ?? []).filter((p) => p.sessions > 0).map((p) => ({ value: p.id, label: p.name }))]}
          />
          <Button size="lg" variant="outline" onClick={() => setSearch({ archived: archivedView ? undefined : "1" })} aria-pressed={archivedView}>
            {archivedView ? "Back to sessions" : "Archived"}
          </Button>
        </div>
        <label htmlFor="sf" className="sr-only">
          Filter sessions
        </label>
        <Input id="sf" data-filter value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by title or folder  /" />
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[12.5px] text-muted-foreground">
          <span className="mr-1">Select older than:</span>
          <Button variant="link" size="xs" onClick={() => pickOlder(30)}>
            30 days
          </Button>
          <Button variant="link" size="xs" onClick={() => pickOlder(7)}>
            7 days
          </Button>
          {picked.size > 0 && (
            <Button variant="link" size="xs" onClick={() => setPicked(new Set())}>
              none
            </Button>
          )}
          <label className="ml-auto flex items-center gap-1.5">
            <Checkbox checked={empty} onCheckedChange={(v) => setEmpty(v === true)} /> show empty
          </label>
        </div>
        {picked.size > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-primary-line bg-accent px-2.5 py-1.5">
            <span className="flex-1 text-[13px] font-medium text-accent-foreground">{picked.size} selected</span>
            <Button variant="outline" onClick={() => archive.mutate({ ids, archived: !archivedView }, { onSuccess: () => setPicked(new Set()) })}>
              {archivedView ? "Unarchive" : "Archive"}
            </Button>
            <Button variant="destructive" onClick={() => askDelete(ids).then(() => setPicked(new Set()))}>
              Delete
            </Button>
          </div>
        )}
      </div>
      {q.isLoading && <Loading />}
      <ErrorNote error={q.error} />
      {!q.isLoading && !list.length && <p className="px-5 py-4 text-muted-foreground">{archivedView ? "No archived sessions." : "No sessions match."}</p>}
      {groups.map(([g, ss]) => (
        <div key={g} className="px-2 pb-1">
          <div className="px-2.5 pb-1 pt-3 text-xs font-medium text-muted-foreground">{g}</div>
          {ss.map((s) => (
            <div key={s.sessionId} className={cn("group flex items-start gap-2 rounded-md px-1.5 hover:bg-sunken", selected === s.sessionId && "bg-surface shadow-[0_0_0_1px_var(--line-strong)]")}>
              <Checkbox
                aria-label={`Select ${s.displayTitle}`}
                checked={picked.has(s.sessionId)}
                onCheckedChange={() => toggle(s.sessionId)}
                className={cn("mt-3 flex-none", !picked.size && "opacity-0 focus-visible:opacity-100 group-hover:opacity-100")}
              />
              <Link to="/sessions/$sid" params={{ sid: s.sessionId }} search={search} className="flex min-w-0 flex-1 flex-col gap-0.5 py-2 text-ink no-underline">
                <span className="flex items-center gap-2">
                  <span className={cn("min-w-0 flex-1 truncate text-[14px]", s.title ? "font-medium" : "text-ink-2")}>{s.displayTitle}</span>
                  {s.running && <Tag tone="accent">Running</Tag>}
                </span>
                <span className="flex gap-2 text-xs text-muted-foreground">
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
    <Dialog open={!!agent} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{`${agent?.type ?? "Subagent"}: ${agent?.description ?? ""}`}</DialogTitle>
        </DialogHeader>
        {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} /> : <Transcript turns={q.data?.turns ?? []} />}
      </DialogContent>
    </Dialog>
  );
}

function SessionDetail({ sid, search }: { sid: string; search: Search }) {
  type Page = Session & { turns: Turn[]; totalTurns: number; offset: number; subagentList: { agentId: string; type: string | null; description: string | null }[] };
  const q = useInfiniteQuery({
    queryKey: ["session", sid],
    queryFn: ({ pageParam }) => api.get<Page>(`/sessions/${sid}?offset=${pageParam}&limit=${TURNS_PER_PAGE}`),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset + last.turns.length < last.totalTurns ? last.offset + last.turns.length : undefined),
  });
  const [mine, setMine] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [raw, setRaw] = useState(false);
  const [sub, setSub] = useState<{ agentId: string; type: string | null; description: string | null } | null>(null);
  const navigate = useNavigate();
  const { archive, askDelete } = useSessionActions();
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const first = q.data!.pages[0];
  const s = { ...first, turns: q.data!.pages.flatMap((p) => p.turns) };
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
            <Button variant="outline" onClick={() => copy(s.resumeCommand).then((ok) => (ok ? toast.success : toast.error)(ok ? "Resume command copied." : s.resumeCommand))}>
              <Copy className="size-3.5" aria-hidden /> Copy resume command
            </Button>
            {!s.running && (
              <Button asChild className="no-underline">
<Link to="/live" search={{ new: "1", resume: s.sessionId }}>
                Resume here
              </Link>
</Button>
            )}
            <IconButton label={s.archivedAt ? "Unarchive" : "Archive"} onClick={() => archive.mutate({ ids: [s.sessionId], archived: !s.archivedAt })}>
              {s.archivedAt ? <ArchiveRestore /> : <Archive />}
            </IconButton>
            {!s.running && (
              <IconButton label="Delete" onClick={() => askDelete([s.sessionId]).then(() => navigate({ to: "/sessions", search }))}>
                <Trash2 />
              </IconButton>
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
            <Toggle key={label as string} variant="outline" size="sm" pressed={on as boolean} onPressedChange={(v) => (set as (v: boolean) => void)(v)} className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground">
              {label as string}
            </Toggle>
          ))}
          {s.subagentList.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Subagent runs ({s.subagentList.length}) <ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-w-[min(520px,90vw)]">
                {s.subagentList.map((a) => (
                  <DropdownMenuItem key={a.agentId} onSelect={() => setSub(a)}>
                    <span className="truncate">
                      <span className="font-medium">{a.type}</span>: {a.description}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <span className="ml-auto flex items-center gap-2 text-[12.5px] text-muted-foreground">
            {plural(prompts, "prompt")}
            <Button variant="ghost" onClick={() => jumpPrompt(-1)} aria-label="Previous prompt">
              ↑
            </Button>
            <Button variant="ghost" onClick={() => jumpPrompt(1)} aria-label="Next prompt">
              ↓
            </Button>
          </span>
        </div>
      </DetailHeader>
      <div className="mx-auto w-full max-w-[880px] px-6 py-5 md:pl-12">
        {raw ? <pre className="overflow-auto rounded-md bg-sunken p-3 font-mono text-xs">{JSON.stringify(s.turns, null, 2)}</pre> : <Transcript turns={s.turns} mineOnly={mine} showThinking={thinking} />}
        {q.hasNextPage && (
          <div className="mt-4 flex items-center justify-center gap-3 text-[13px] text-muted-foreground">
            <span>
              Showing {s.turns.length} of {first.totalTurns} turns
            </span>
            <Button variant="outline" busy={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
              Load more
            </Button>
          </div>
        )}
        <p className="mt-6 text-center text-xs text-muted-foreground">Transcripts belong to Claude Code and are shown read-only.</p>
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
      detail={sid ? <SessionDetail key={sid} sid={sid} search={search} /> : <EmptyState title="Pick a session">Its conversation opens here, with tool calls folded away until you need them.</EmptyState>}
    />
  );
}
