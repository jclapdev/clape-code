import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { api, enc } from "@/lib/api";
import { ago, when } from "@/lib/format";
import { copyCommand, resumeCommand } from "@/lib/resume";
import type { Job, LiveSession, PendingRequest, Project } from "@/lib/types";
import { Page } from "@/components/Panes";
import { Dot, ErrorNote, Loading } from "@/components/ui";

interface Overview {
  needsYou: (
    | { type: "live"; id: string; cwd: string; request: PendingRequest; at: string }
    | { type: "job"; id: string; name: string | null; cwd: string | null; detail: string | null; sessionId: string | null; at: string | null }
  )[];
  paused: { id: string; name: string; cwd: string | null; sessionId: string | null; at: string | null }[];
  jobs: Job[];
  jobCounts: Record<string, number>;
  projects: Project[];
  changes: { project: string; projectId: string; date: string; text: string }[];
}

const STATE_TONE: Record<string, "accent" | "attn" | "ok" | "muted"> = { working: "accent", blocked: "attn", done: "ok" };
const STATE_LABEL: Record<string, string> = { working: "Working", blocked: "Waiting for you", done: "Done" };

function NeedsYouCard({ item }: { item: Overview["needsYou"][number] }) {
  const qc = useQueryClient();
  const respond = useMutation({
    mutationFn: (decision: "allow" | "deny") => api.post(`/live/${item.id}/respond`, { requestId: (item as any).request.requestId, decision }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["overview"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  if (item.type === "live") {
    const r = item.request;
    const isQ = r.type === "question";
    return (
      <div className="flex flex-col gap-2.5 rounded-lg border border-attn-line bg-surface p-4">
        <div className="flex justify-between gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate font-mono">{item.cwd}</span>
          <span className="flex-none">Live session, {ago(item.at)}</span>
        </div>
        <div className="text-[15px] font-semibold">{isQ ? "Claude has a question" : `Claude wants to use ${r.toolName}`}</div>
        {isQ ? (
          <p className="text-ink-2">{r.input?.questions?.[0]?.question}</p>
        ) : (
          r.summary && <div className="overflow-x-auto whitespace-nowrap rounded-md bg-sunken px-2.5 py-2 font-mono text-[12.5px]">{r.summary}</div>
        )}
        <div className="flex flex-wrap gap-2">
          {!isQ && (
            <>
              <Button variant="default" busy={respond.isPending} onClick={() => respond.mutate("allow")}>
                Allow once
              </Button>
              <Button variant="outline" onClick={() => respond.mutate("deny")}>
                Deny
              </Button>
            </>
          )}
          <Button asChild variant="outline" className="no-underline">
<Link to="/live/$id" params={{ id: item.id }}>
            {isQ ? "Answer" : "Open"}
          </Link>
</Button>
        </div>
      </div>
    );
  }
  const cmd = item.sessionId ? resumeCommand(item.cwd, item.sessionId) : null;
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-attn-line bg-surface p-4">
      <div className="flex justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate font-mono">{item.cwd ?? ""}</span>
        <span className="flex-none">Background session, since {when(item.at)}</span>
      </div>
      <div className="text-[15px] font-semibold">{item.name ?? "Background session"}</div>
      <p className="line-clamp-3 text-ink-2">{item.detail || "Stopped and waiting for an answer before it can go on."}</p>
      <div className="flex flex-wrap gap-2">
        {item.sessionId && (
          <Button asChild className="no-underline">
<Link to="/live" search={{ new: "1", resume: item.sessionId }}>
            Answer here
          </Link>
</Button>
        )}
        {cmd && (
          <Button variant="outline" onClick={() => copyCommand(cmd)}>
            Copy resume command
          </Button>
        )}
        <Button asChild variant="link" size="sm">
          <Link to="/jobs/$id" params={{ id: item.id }}>
            Details
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

const rowClass = "flex items-center gap-3 border-t border-line px-4 py-2.5 text-ink no-underline hover:bg-sunken/60";

export function HomePage() {
  const q = useQuery({ queryKey: ["overview"], queryFn: () => api.get<Overview>("/overview") });
  const liveQ = useQuery({ queryKey: ["live"], queryFn: () => api.get<LiveSession[]>("/live") });
  const running = (liveQ.data ?? []).filter((l) => l.status !== "stopped");
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const o = q.data!;
  const counts = Object.entries(o.jobCounts).map(([s, n]) => `${n} ${(STATE_LABEL[s] ?? s).toLowerCase()}`).join(", ");

  return (
    <Page
      title="Home"
      actions={
        <Button asChild size="lg" className="no-underline">
<Link to="/live" search={{ new: "1" }}>
          New session
        </Link>
</Button>
      }
    >
      <div className="flex flex-col gap-6">
        <section aria-labelledby="needs" className="flex flex-col gap-3">
          <h2 id="needs" className={o.needsYou.length ? "text-[15px] font-semibold text-attn" : "text-[15px] font-semibold"}>
            Needs attention{o.needsYou.length ? ` (${o.needsYou.length})` : ""}
          </h2>
          {!o.needsYou.length && <p className="-mt-2 text-[13.5px] text-muted-foreground">Nothing right now.</p>}
          {o.needsYou.length > 0 && (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
              {o.needsYou.map((n) => (
                <NeedsYouCard key={n.type + n.id} item={n} />
              ))}
            </div>
          )}
        </section>

        {running.length > 0 && (
          <Section title="Active sessions">
            {running.map((l) => (
              <Link key={l.id} to="/live/$id" params={{ id: l.id }} className={rowClass}>
                <Dot tone={l.pending.length ? "attn" : l.status === "working" ? "accent" : "ok"} />
                <span className="min-w-0 flex-1 truncate">{(l.events.find((e) => e.kind === "user") as { text?: string } | undefined)?.text?.split("\n")[0] ?? "Session"}</span>
                <span className="hidden text-xs text-muted-foreground sm:inline">{l.cwd.split("/").pop()}</span>
                <span className="w-28 text-right text-xs text-muted-foreground">{l.pending.length ? "Needs you" : l.status === "working" ? "Working" : "Finished its turn"}</span>
              </Link>
            ))}
          </Section>
        )}

        {o.paused.length > 0 && (
          <Section title="Paused sessions" aside={<span className="text-xs text-muted-foreground">Stopped by a usage limit that has since reset</span>}>
            {o.paused.map((j) => (
              <div key={j.id} className={rowClass}>
                <span className="min-w-0 flex-1 truncate">{j.name}</span>
                <span className="hidden text-xs text-muted-foreground sm:inline">{when(j.at)}</span>
                {j.sessionId && (
                  <Button asChild size="sm" variant="outline" className="no-underline">
                    <Link to="/live" search={{ resume: j.sessionId }}>
                      Continue
                    </Link>
                  </Button>
                )}
              </div>
            ))}
          </Section>
        )}

        <Section title="Background sessions" aside={<span className="text-xs text-muted-foreground">{counts}</span>}>
          {o.jobs.map((j) => (
            <Link key={j.id} to="/jobs/$id" params={{ id: j.id }} className={rowClass}>
              <Dot tone={STATE_TONE[j.state] ?? "muted"} />
              <span className="min-w-0 flex-1 truncate">{j.name}</span>
              <span className="hidden text-xs text-muted-foreground sm:inline">{j.cwd}</span>
              <span className="w-28 text-right text-xs text-muted-foreground">{STATE_LABEL[j.state] ?? j.state}</span>
            </Link>
          ))}
          {!o.jobs.length && <p className="border-t border-line px-4 py-3 text-muted-foreground">No background sessions yet.</p>}
        </Section>

        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
          <Section title="Projects" aside={<Link to="/projects" className="text-[13px]">View all</Link>}>
            {o.projects.map((p) => (
              <Link key={p.id} to="/projects/$id" params={{ id: p.id }} search={{}} className={rowClass}>
                <span className="flex-1">{p.name}</span>
                {p.backlog && <span className="text-xs text-muted-foreground">{p.backlog.open} open</span>}
                <span className="text-xs text-muted-foreground">{p.git?.branch ?? ""}</span>
                <span className="w-20 text-right text-xs text-muted-foreground">{when(p.lastSessionAt)}</span>
              </Link>
            ))}
          </Section>
          <Section title="Changelog">
            {o.changes.map((c, i) => (
              <Link key={i} to="/projects/$id" params={{ id: c.projectId }} search={{}} hash="changelog" className={rowClass + " items-start"}>
                <span className="w-24 flex-none text-xs text-muted-foreground">{c.project}</span>
                <span className="min-w-0 flex-1 text-[13.5px]">{c.text.replace(/\*\*/g, "")}</span>
                <span className="flex-none text-xs text-muted-foreground">{c.date}</span>
              </Link>
            ))}
            {!o.changes.length && <p className="border-t border-line px-4 py-3 text-muted-foreground">No changelog entries found in your projects.</p>}
          </Section>
        </div>
      </div>
    </Page>
  );
}

export { enc };
