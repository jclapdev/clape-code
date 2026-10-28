import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ago } from "@/lib/format";
import type { Job, PendingRequest, Session } from "@/lib/types";
import { Tag } from "@/components/ui";

export interface Overview {
  needsYou: (
    | { type: "live"; id: string; sessionId: string; cwd: string; request: PendingRequest; at: string }
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
  sessionId: string | null;
  jobId: string | null;
  fromScript: boolean;
  archived: boolean;
  /** A copy Control Center made of a conversation open in another window: the original. */
  copyOf?: Session["copyOf"];
  /** needs: waiting for an answer; running: Claude is working. */
  status: "needs" | "running" | null;
}

export const useOverview = () => useQuery({ queryKey: ["overview"], queryFn: () => api.get<Overview>("/overview") });

/** Live requests waiting for an answer, and every session newest first. `archived` adds archived sessions. */
export function useSessionEntries({ archived = false }: { archived?: boolean } = {}) {
  const overview = useOverview();
  const sessions = useQuery({
    queryKey: ["sessions", archived ? "with-archived" : "all"],
    queryFn: () => api.get<Session[]>(archived ? "/sessions?archived=all" : "/sessions"),
  });
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => api.get<{ jobs: Job[] }>("/jobs") });
  const o = overview.data;
  const needsJobs = new Set(o?.needsYou.flatMap((n) => (n.type === "job" ? [n.id] : [])) ?? []);
  const asking = new Set(o?.needsYou.flatMap((n) => (n.type === "live" ? [n.sessionId] : [])) ?? []);
  const bySession = new Map((jobs.data?.jobs ?? []).flatMap((j) => (j.sessionId ? [[j.sessionId, j] as const] : [])));
  const listed = new Set((sessions.data ?? []).map((s) => s.sessionId));

  const entries: SessionEntry[] = [
    ...(sessions.data ?? []).map((s): SessionEntry => {
      const job = bySession.get(s.sessionId);
      const needs = (job && needsJobs.has(job.id)) || asking.has(s.sessionId) || s.activity === "waiting";
      return {
        key: s.sessionId,
        title: job?.name ?? s.displayTitle,
        cwd: s.cwd,
        project: s.project,
        at: s.lastAt,
        sessionId: s.sessionId,
        jobId: job?.id ?? null,
        fromScript: s.fromScript,
        archived: s.archived,
        copyOf: s.copyOf,
        status: needs ? "needs" : s.activity === "working" ? "running" : null,
      };
    }),
    ...(jobs.data?.jobs ?? [])
      .filter((j) => !j.sessionId || !listed.has(j.sessionId))
      .map(
        (j): SessionEntry => ({
          key: "job" + j.id,
          title: j.name ?? "Background session",
          cwd: j.cwd,
          project: null,
          at: j.updatedAt,
          sessionId: null,
          jobId: j.id,
          fromScript: false,
          archived: false,
          status: needsJobs.has(j.id) ? "needs" : null,
        }),
      ),
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

/** One line in a list: what it is, where and when, a tag, and what you can do. */
export function Row({ title, about, tag, children }: { title: ReactNode; about: ReactNode; tag?: ReactNode; children: ReactNode }) {
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
        <Link to="/sessions/$sid" params={{ sid: item.sessionId }}>
          {isQ ? "Answer" : "Open"}
        </Link>
      </Button>
    </Row>
  );
}

/** The state label, shown only while Claude is working or waiting for you. Words match the conversation page. */
const TAGS = {
  needs: <Tag tone="attn">Waiting for you</Tag>,
  running: <Tag tone="accent">Working</Tag>,
};

const ROW =
  "flex min-h-14 items-center gap-3 px-4 py-2.5 text-inherit no-underline hover:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

/**
 * A session's line, the same for every session: title, project and time since last activity, a state label while
 * Claude is working or waiting, and "Archived" when it is. The whole line opens the conversation.
 */
export function SessionRow({ e }: { e: SessionEntry }) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-ink">{e.title}</div>
        <div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
          {join(folder(e.project ?? e.cwd) ?? "Not in a project", ago(e.at), e.copyOf && `Copy of ${e.copyOf.title ?? "another conversation"}`)}
        </div>
      </div>
      {(e.status || e.archived || e.copyOf) && (
        <div className="flex flex-none flex-wrap justify-end gap-1.5">
          {e.status && TAGS[e.status]}
          {e.copyOf && <Tag>Copy</Tag>}
          {e.archived && <Tag>Archived</Tag>}
        </div>
      )}
    </>
  );
  return (
    <li>
      {e.sessionId ? (
        <Link to="/sessions/$sid" params={{ sid: e.sessionId }} className={ROW}>
          {body}
        </Link>
      ) : (
        <Link to="/jobs/$id" params={{ id: e.jobId! }} className={ROW}>
          {body}
        </Link>
      )}
    </li>
  );
}
