import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { accountLabel, ago, when } from "@/lib/format";
import type { Job, PendingRequest, Session } from "@/lib/types";
import { Tag } from "@/components/ui";

export interface Overview {
  needsYou: (
    | { type: "live"; id: string; cwd: string; request: PendingRequest; at: string }
    | { type: "job"; id: string; name: string | null; cwd: string | null; detail: string | null; sessionId: string | null; at: string | null }
  )[];
}

type LiveRequest = Extract<Overview["needsYou"][number], { type: "live" }>;

/**
 * One line per session, from transcripts and background sessions together.
 * A background session whose transcript isn't listed still gets a line of its own.
 */
export interface SessionEntry {
  key: string;
  title: string;
  cwd: string | null;
  project: string | null;
  at: string | null;
  session: Session | null;
  job: { id: string; detail: string | null } | null;
  status: "needs" | "running" | null;
}

export const useOverview = () => useQuery({ queryKey: ["overview"], queryFn: () => api.get<Overview>("/overview") });

/** Live requests waiting for an answer, and every session newest first. */
export function useSessionEntries() {
  const overview = useOverview();
  const sessions = useQuery({ queryKey: ["sessions", "all"], queryFn: () => api.get<Session[]>("/sessions") });
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => api.get<{ jobs: Job[] }>("/jobs") });
  const o = overview.data;
  const needsJobs = new Set(o?.needsYou.flatMap((n) => (n.type === "job" ? [n.id] : [])) ?? []);
  const bySession = new Map((jobs.data?.jobs ?? []).flatMap((j) => (j.sessionId ? [[j.sessionId, j] as const] : [])));
  const listed = new Set((sessions.data ?? []).map((s) => s.sessionId));
  const statusOf = (job: Job | undefined, running: boolean): SessionEntry["status"] =>
    job && needsJobs.has(job.id) ? "needs" : running ? "running" : null;

  const entries: SessionEntry[] = [
    ...(sessions.data ?? []).map((s) => {
      const job = bySession.get(s.sessionId);
      return { key: s.sessionId, title: job?.name ?? s.displayTitle, cwd: s.cwd, project: s.project, at: s.lastAt, session: s, job: job ? { id: job.id, detail: job.detail } : null, status: statusOf(job, s.running) };
    }),
    ...(jobs.data?.jobs ?? [])
      .filter((j) => !j.sessionId || !listed.has(j.sessionId))
      .map((j) => ({ key: "job" + j.id, title: j.name ?? "Background session", cwd: j.cwd, project: null, at: j.updatedAt, session: null, job: { id: j.id, detail: j.detail }, status: statusOf(j, false) })),
  ].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  const requests = (o?.needsYou ?? []).filter((n): n is LiveRequest => n.type === "live");
  return {
    requests,
    entries,
    isLoading: overview.isLoading || sessions.isLoading || jobs.isLoading,
    error: overview.error ?? sessions.error ?? jobs.error,
  };
}

export const folder = (cwd: string | null) => (cwd ? cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd : null);
const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

/** One line in a session list: what it is, where and when, a tag, and what you can do. */
function Row({ title, about, tag, children }: { title: ReactNode; about: ReactNode; tag?: ReactNode; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1 basis-60">
        <div className="flex min-w-0 items-center gap-2">
          {tag}
          <span className="min-w-0 truncate font-medium text-ink">{title}</span>
        </div>
        <div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{about}</div>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </li>
  );
}

export function LiveRequestRow({ item }: { item: LiveRequest }) {
  const qc = useQueryClient();
  const respond = useMutation({
    mutationFn: (decision: "allow" | "deny") => api.post(`/live/${item.id}/respond`, { requestId: item.request.requestId, decision }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["overview"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const r = item.request;
  const isQ = r.type === "question";
  return (
    <Row
      tag={<Tag tone="attn">Needs you</Tag>}
      title={isQ ? (r.input?.questions?.[0]?.question ?? "Claude has a question") : `Claude wants to use ${r.toolName}`}
      about={join(folder(item.cwd), isQ ? null : r.summary, ago(item.at))}
    >
      {!isQ && (
        <>
          <Button size="sm" busy={respond.isPending} onClick={() => respond.mutate("allow")}>
            Allow once
          </Button>
          <Button size="sm" variant="outline" onClick={() => respond.mutate("deny")}>
            Deny
          </Button>
        </>
      )}
      <Button asChild size="sm" variant="outline" className="no-underline">
        <Link to="/live/$id" params={{ id: item.id }}>
          {isQ ? "Answer" : "Open"}
        </Link>
      </Button>
    </Row>
  );
}

const TAGS = {
  needs: <Tag tone="attn">Needs you</Tag>,
  running: <Tag tone="ok">Running</Tag>,
};

/**
 * A session's line. A background session opens on its own page (state, what it's doing, transcript link);
 * any other opens its transcript. `search` is kept on the transcript link so a filtered list stays filtered.
 */
export function SessionRow({ e, search }: { e: SessionEntry; search?: Record<string, string | boolean | undefined> }) {
  const sid = e.session?.sessionId ?? null;
  const about =
    e.status === "needs"
      ? join(folder(e.project ?? e.cwd), e.job?.detail || "Stopped and waiting for an answer before it can go on.")
      : join(folder(e.project ?? e.cwd), e.job && "Background", when(e.at), accountLabel(e.session?.account));
  return (
    <Row tag={e.status ? TAGS[e.status] : undefined} title={e.title} about={about}>
      {e.status === "needs" && sid && (
        <Button asChild size="sm" className="no-underline">
          <Link to="/live" search={{ new: "1", resume: sid } as never}>
            Answer
          </Link>
        </Button>
      )}
      {e.status !== "needs" && e.status !== "running" && sid && (
        <Button asChild size="sm" variant="outline" className="no-underline">
          <Link to="/live" search={{ resume: sid } as never}>
            Continue
          </Link>
        </Button>
      )}
      <Button asChild size="sm" variant="outline" className="no-underline">
        {e.job ? (
          <Link to="/jobs/$id" params={{ id: e.job.id }}>
            Open
          </Link>
        ) : (
          <Link to="/sessions/$sid" params={{ sid: sid! }} search={(search ?? {}) as never}>
            Open
          </Link>
        )}
      </Button>
    </Row>
  );
}
