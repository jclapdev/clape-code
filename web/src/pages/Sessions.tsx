import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link, Navigate, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Archive, ArchiveRestore, ChevronDown, Copy, Trash2 } from "lucide-react";
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
              <IconButton label="Delete" onClick={() => askDelete([s.sessionId]).then(() => (s.project ? navigate({ to: "/projects/$id", params: { id: s.project }, search: {} }) : navigate({ to: "/" })))}>
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

export function SessionsPage() {
  const { sid } = useParams({ strict: false }) as { sid?: string };
  const search = useSearch({ strict: false }) as Search;
  // Sessions live in their projects; this page only opens one conversation.
  if (!sid) return <Navigate to="/projects" />;
  return (
    <div className="h-full overflow-auto">
      <SessionDetail key={sid} sid={sid} search={search} />
    </div>
  );
}
