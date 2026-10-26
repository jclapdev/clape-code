import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronLeft, Plus, Search } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import { ErrorNote, Loading, useConfirm } from "@/components/ui";
import { Toggle } from "@/components/ui/toggle";
import { Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/SimpleSelect";
import { LiveRequestRow, SessionRow, folder, useSessionEntries } from "@/components/SessionRows";

export function useSessionActions() {
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
          <Link to="/sessions/new" search={project && project !== OUTSIDE ? { project } : {}}>
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

/** The list takes the full page width; an opened conversation is its own page (Conversation.tsx). */
export function SessionsPage() {
  const search = useSearch({ strict: false }) as SessionsSearch;
  return (
    <section aria-label="Sessions" className="h-full overflow-auto">
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
