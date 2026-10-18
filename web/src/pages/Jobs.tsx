import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { api } from "@/lib/api";
import { when } from "@/lib/format";
import { copyCommand, resumeCommand } from "@/lib/resume";
import type { Job } from "@/lib/types";
import { DetailHeader, ListGroup, TwoPane } from "@/components/Panes";
import { Dot, EmptyState, ErrorNote, Loading, Tag, cn } from "@/components/ui";

const TONE: Record<string, "accent" | "attn" | "ok" | "muted"> = { working: "accent", blocked: "attn", done: "ok" };
const LABEL: Record<string, string> = { working: "Working", blocked: "Waiting for you", done: "Done" };

function JobList({ selected }: { selected: string | null }) {
  const q = useQuery({ queryKey: ["jobs"], queryFn: () => api.get<{ jobs: Job[]; processes: { pid: number; sessionId: string; cwd: string | null; name: string | null; status: string | null }[] }>("/jobs") });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const { jobs, processes } = q.data!;
  const order = ["blocked", "working", "done"];
  const states = [...new Set(jobs.map((j) => j.state))].sort((a, b) => (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99);
  return (
    <div className="pb-6 pt-2">
      {processes.length > 0 && (
        <ListGroup label="Running now">
          {processes.map((p) => (
            <div key={p.pid} className="flex items-center gap-2 px-2.5 py-1.5 text-[13px]">
              <Dot tone={p.status === "busy" ? "accent" : "muted"} />
              <span className="min-w-0 flex-1 truncate">{p.name ?? p.cwd}</span>
              <span className="text-xs text-muted-foreground">{p.status}</span>
            </div>
          ))}
        </ListGroup>
      )}
      {states.map((st) => (
        <ListGroup key={st} label={LABEL[st] ?? st}>
          {jobs
            .filter((j) => j.state === st)
            .map((j) => (
              <Link key={j.id} to="/jobs/$id" params={{ id: j.id }} className={cn("flex flex-col gap-0.5 rounded-md px-2.5 py-2 text-ink no-underline hover:bg-sunken", selected === j.id && "bg-surface shadow-[0_0_0_1px_var(--line-strong)]")}>
                <span className="flex items-center gap-2">
                  <Dot tone={TONE[j.state] ?? "muted"} />
                  <span className="min-w-0 flex-1 truncate font-medium">{j.name ?? "Background session"}</span>
                </span>
                <span className="flex gap-2 pl-4 text-xs text-muted-foreground">
                  <span className="truncate font-mono">{j.cwd}</span>
                  <span className="ml-auto flex-none">{when(j.updatedAt)}</span>
                </span>
              </Link>
            ))}
        </ListGroup>
      ))}
      {!jobs.length && <p className="px-5 text-muted-foreground">No background sessions yet.</p>}
    </div>
  );
}

function JobDetail({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["job", id], queryFn: () => api.get<Job>(`/jobs/${id}`) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const j = q.data!;
  const cmd = j.sessionId ? resumeCommand(j.cwd, j.sessionId) : null;
  return (
    <div>
      <DetailHeader
        title={j.name ?? "Background session"}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <Tag tone={j.state === "blocked" ? "attn" : j.state === "done" ? "ok" : "accent"}>{LABEL[j.state] ?? j.state}</Tag>
            <span className="font-mono">{j.cwd}</span>
            <span>started {when(j.createdAt)}</span>
          </span>
        }
        actions={
          <>
            {cmd && (
              <Button variant="outline" onClick={() => copyCommand(cmd)}>
                Copy resume command
              </Button>
            )}
            {j.sessionId && (
              <Button asChild variant="outline" className="no-underline">
<Link to="/sessions/$sid" params={{ sid: j.sessionId }} search={{}}>
                Open transcript
              </Link>
</Button>
            )}
            {j.state === "blocked" && j.sessionId && (
              <Button asChild className="no-underline">
<Link to="/live" search={{ new: "1", resume: j.sessionId }}>
                Answer here
              </Link>
</Button>
            )}
          </>
        }
      >
        {j.detail && <p className="text-ink-2">{j.detail}</p>}
      </DetailHeader>
      <ol className="mx-auto max-w-[820px] px-6 py-5 md:pl-12">
        {[...j.timeline].reverse().map((t, i) => (
          <li key={i} className="flex gap-4 border-l-2 border-line pb-4 pl-4">
            <span className="w-20 flex-none text-xs text-muted-foreground">{when(t.at)}</span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium">{LABEL[t.state] ?? t.state}</div>
              {(t.detail || t.text) && <div className="whitespace-pre-wrap text-[13px] text-ink-2">{t.text ?? t.detail}</div>}
            </div>
          </li>
        ))}
        {!j.timeline.length && <p className="text-muted-foreground">No timeline recorded.</p>}
      </ol>
    </div>
  );
}

export function JobsPage() {
  const { id } = useParams({ strict: false }) as { id?: string };
  const navigate = useNavigate();
  return (
    <TwoPane
      id="jobs"
      listLabel="Jobs"
      hasSelection={!!id}
      onBack={() => navigate({ to: "/jobs" })}
      list={<JobList selected={id ?? null} />}
      detail={id ? <JobDetail id={id} /> : <EmptyState title="No background sessions">Sessions running in the background show their status and timeline here, with ones waiting for you first.</EmptyState>}
    />
  );
}
