import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronLeft, Plus, Search } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import { PAGE_SCROLL } from "@/components/Panes";
import { ErrorNote, Loading, Switch, useConfirm } from "@/components/ui";
import { Input } from "@/components/ui/input";
import { SessionRow, folder, useSessionEntries } from "@/components/SessionRows";

export function useSessionActions() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const archive = useMutation({
    mutationFn: ({ ids, archived }: { ids: string[]; archived: boolean }) => api.post("/sessions/archive", { ids, archived }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["session"] });
      toast.success(v.archived ? v.ids.length === 1 ? "Archived the session. It can still be resumed." : `Archived ${v.ids.length} sessions. They can still be resumed.` : "Moved back to your sessions.");
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

/**
 * project: opened from that project's page, so the list starts filtered to it; all: the switch that shows every
 * project. scripts: also list `claude -p` runs. archived: also list archived sessions.
 */
export type SessionsSearch = { project?: string; all?: boolean; scripts?: boolean; archived?: boolean; needs?: boolean; q?: string };

function SessionsList({ search }: { search: SessionsSearch }) {
  const { entries, isLoading, error } = useSessionEntries({ archived: !!search.archived });
  const navigate = useNavigate();
  const [q, setQLocal] = useState(search.q ?? "");
  const go = (next: Partial<SessionsSearch>) => void navigate({ to: ".", search: (s: SessionsSearch) => ({ ...s, ...next }) as never, replace: true });
  const setQ = (v: string) => {
    setQLocal(v);
    go({ q: v || undefined });
  };
  const project = search.project && !search.all ? search.project : "";
  const needs = !!search.needs;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  // Like Claude Code's session picker: `claude -p` runs left out, and the current project's sessions unless widened.
  const listed = entries.filter((e) => (search.scripts || !e.fromScript) && (!project || e.project === project));
  const shown = listed.filter((e) => (!needs || e.status === "needs") && words.every((w) => e.title.toLowerCase().includes(w)));
  const ordered = [...shown.filter((e) => e.status === "needs"), ...shown.filter((e) => e.status !== "needs")];

  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-5 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-[24px] font-semibold tracking-[-0.01em]">Sessions</h1>
        <Button asChild className="no-underline">
          <Link to="/sessions/new" search={project ? { project } : {}}>
            <Plus aria-hidden /> New session
          </Link>
        </Button>
      </div>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles" aria-label="Search session titles" className="h-9 pl-8" />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {search.project && <Switch label="Every project" on={!!search.all} onChange={(v) => go({ all: v || undefined })} />}
        <Switch label="Needs you" on={needs} onChange={(v) => go({ needs: v || undefined })} />
        <Switch label="Show runs from scripts" on={!!search.scripts} onChange={(v) => go({ scripts: v || undefined })} />
        <Switch label="Show archived" on={!!search.archived} onChange={(v) => go({ archived: v || undefined })} />
      </div>
      {error && <ErrorNote error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <p className="text-[13px] text-muted-foreground">
            {project ? `${folder(project)}: ` : ""}
            {shown.length === listed.length ? plural(listed.length, "session") : `${shown.length} of ${plural(listed.length, "session")}`}
          </p>
          {ordered.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {ordered.map((e) => (
                <SessionRow key={e.key} e={e} />
              ))}
            </ul>
          ) : (
            <p className="text-[13.5px] text-muted-foreground">
              {listed.length
                ? needs
                  ? "Nothing needs you right now."
                  : "Nothing matches. Try other words."
                : entries.length
                  ? `No sessions${project ? ` in ${folder(project)}` : ""} yet.${project ? ' Turn on "Every project" to see the others.' : ""}`
                  : 'No sessions yet. Press "New session" to give Claude a task.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** The list takes the full page width; an opened conversation is its own page (Conversation.tsx). */
export function SessionsPage() {
  const search = useSearch({ strict: false }) as SessionsSearch;
  return (
    <section aria-label="Sessions" className={PAGE_SCROLL}>
      <div className="mx-auto max-w-[1180px] md:px-2">
        <SessionsList search={search} />
      </div>
    </section>
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
