import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Archive, ArchiveRestore, ChevronDown, ChevronLeft, Copy, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { compact, modelName, money, plural, when } from "@/lib/format";
import { copyCommand } from "@/lib/resume";
import type { Session, Turn } from "@/lib/types";
import { DetailHeader } from "@/components/Panes";
import { Transcript } from "@/components/Transcript";
import { ErrorNote, Loading, useConfirm } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Toggle } from "@/components/ui/toggle";
import { IconButton } from "@/components/IconButton";
import { Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/SimpleSelect";
import { LiveRequestRow, SessionRow, folder, useSessionEntries } from "@/components/SessionRows";

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
  const askDelete = async (ids: string[]) => {
    const yes = await confirm({
      title: ids.length === 1 ? "Delete this session?" : `Delete ${ids.length} sessions?`,
      body: "The transcripts move to your computer's trash, where you can still recover them. Deleted sessions can't be resumed. Archive instead if you only want them out of the list.",
      confirm: "Move to trash",
      danger: true,
    });
    if (yes) del.mutate(ids);
    return yes;
  };
  return { archive, del, askDelete };
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

function SessionDetail({ sid }: { sid: string }) {
  type Page = Session & { turns: Turn[]; totalTurns: number; offset: number; subagentList: { agentId: string; type: string | null; description: string | null }[] };
  const q = useInfiniteQuery({
    queryKey: ["session", sid],
    queryFn: ({ pageParam }) => api.get<Page>(`/sessions/${sid}?offset=${pageParam}&limit=${TURNS_PER_PAGE}`),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset + last.turns.length < last.totalTurns ? last.offset + last.turns.length : undefined),
  });
  const [mine, setMine] = useState(false);
  const [thinking, setThinking] = useState(false);
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
            {s.project ? (
              <Link to="/projects/$id" params={{ id: s.project }} search={{}}>
                ← {s.project.split("/").pop()}
              </Link>
            ) : (
              <span>{s.cwd}</span>
            )}
            {s.model && <span>{modelName(s.model)}</span>}
            <span>{when(s.firstAt)}</span>
            <span>{compact(tokens)} tokens</span>
            {s.costUSD != null && <span>{money(s.costUSD)}</span>}
          </span>
        }
        actions={
          <>
            {!s.running && (
              <Button asChild className="no-underline">
                <Link to="/live" search={{ resume: s.sessionId }}>
                  Continue this session
                </Link>
              </Button>
            )}
            <Button variant="outline" onClick={() => copyCommand(s.resumeCommand)}>
              <Copy className="size-3.5" aria-hidden /> Copy command for the terminal
            </Button>
            <IconButton label={s.archivedAt ? "Unarchive" : "Archive"} onClick={() => archive.mutate({ ids: [s.sessionId], archived: !s.archivedAt })}>
              {s.archivedAt ? <ArchiveRestore /> : <Archive />}
            </IconButton>
            {!s.running && (
              <IconButton label="Delete" onClick={() => askDelete([s.sessionId]).then((ok) => { if (ok) void navigate({ to: "/sessions", search: {} }); })}>
                <Trash2 />
              </IconButton>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {[
            ["Only my messages", mine, setMine],
            ["Show Claude's thinking", thinking, setThinking],
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
        <Transcript turns={s.turns} mineOnly={mine} showThinking={thinking} />
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

export type SessionsSearch = { project?: string; needs?: boolean; q?: string };

/** "none" picks sessions outside every project. */
const OUTSIDE = "none";

function SessionsList({ search }: { search: SessionsSearch }) {
  const { requests, entries, isLoading, error } = useSessionEntries();
  const navigate = useNavigate();
  const [q, setQLocal] = useState(search.q ?? "");
  const go = (next: Partial<SessionsSearch>) => void navigate({ to: ".", search: (s: SessionsSearch) => ({ ...s, ...next }) as never, replace: true });
  const setQ = (v: string) => {
    setQLocal(v);
    go({ q: v || undefined });
  };
  const project = search.project ?? "";
  const needs = !!search.needs;
  const projects = [...new Set(entries.flatMap((e) => (e.project ? [e.project] : [])))].sort((a, b) => folder(a)!.localeCompare(folder(b)!));
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = entries.filter(
    (e) =>
      (!project || (project === OUTSIDE ? !e.project : e.project === project)) &&
      (!needs || e.status === "needs") &&
      words.every((w) => e.title.toLowerCase().includes(w)),
  );
  // Live requests have no title or project to filter by; they show whenever no project is picked and nothing is typed.
  const asks = !project && !words.length ? requests : [];
  const filtered = !!project || needs || !!words.length;
  const ordered = [...shown.filter((e) => e.status === "needs"), ...shown.filter((e) => e.status !== "needs")];

  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-5 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-[24px] font-semibold tracking-[-0.01em]">Sessions</h1>
        <Button asChild className="no-underline">
          <Link to="/live" search={{ new: "1", ...(project && project !== OUTSIDE ? { project } : {}) } as never}>
            <Plus aria-hidden /> New session
          </Link>
        </Button>
      </div>
      <p className="leading-relaxed text-ink-2">Every conversation with Claude Code in every project, newest first, including ones run in the background. Open one to read it, or continue it where it stopped.</p>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles" aria-label="Search session titles" className="h-9 pl-8" />
        </div>
        <SimpleSelect
          label="Show sessions for"
          value={project}
          onChange={(v) => go({ project: v || undefined })}
          className="h-9 min-w-[160px]"
          options={[{ value: "", label: "Every project" }, ...projects.map((p) => ({ value: p, label: folder(p)! })), { value: OUTSIDE, label: "Not in a project" }]}
        />
        <Toggle variant="outline" size="sm" pressed={needs} onPressedChange={(v) => go({ needs: v || undefined })} className="h-9 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground">
          Needs you
        </Toggle>
      </div>
      {error && <ErrorNote error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <p className="text-[13px] text-muted-foreground">{filtered ? `${shown.length} of ${plural(entries.length, "session")}` : plural(entries.length, "session")}</p>
          {asks.length + ordered.length ? (
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
              {asks.map((r) => (
                <LiveRequestRow key={"live" + r.id} item={r} />
              ))}
              {ordered.map((e) => (
                <SessionRow key={e.key} e={e} search={search} />
              ))}
            </ul>
          ) : (
            <p className="text-[13.5px] text-muted-foreground">{entries.length ? (needs ? "Nothing needs you right now." : "Nothing matches. Try other words or another project.") : 'No sessions yet. Press "New session" to give Claude a task.'}</p>
          )}
        </>
      )}
    </div>
  );
}

/** The list takes the full page width; an opened session is its own page with Back. */
export function SessionsPage() {
  const { sid } = useParams({ strict: false }) as { sid?: string };
  const search = useSearch({ strict: false }) as SessionsSearch;
  if (!sid)
    return (
      <section aria-label="Sessions" className="h-full overflow-auto">
        <div className="mx-auto max-w-[1180px] md:px-2">
          <SessionsList search={search} />
        </div>
      </section>
    );
  return (
    <div className="flex h-full flex-col">
      <BackBar search={search} />
      <div className="min-h-0 flex-1 overflow-auto">
        <SessionDetail key={sid} sid={sid} />
      </div>
    </div>
  );
}

/** The Back link above a session opened on its own page; it returns to the list as it was filtered. */
export function BackBar({ search = {} }: { search?: SessionsSearch }) {
  return (
    <Link to="/sessions" search={search as never} className="flex h-11 flex-none items-center gap-1 border-b border-line px-3 text-[13.5px] no-underline">
      <ChevronLeft className="size-4" aria-hidden /> Sessions
    </Link>
  );
}
