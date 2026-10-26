import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { when } from "@/lib/format";
import type { Job } from "@/lib/types";
import { DetailHeader } from "@/components/Panes";
import { ErrorNote, Loading, Tag } from "@/components/ui";
import { BackBar } from "./Sessions";

const LABEL: Record<string, string> = { working: "Working", blocked: "Waiting for you", done: "Done" };

/** A background session with a session ID opens as its conversation; one without shows its recorded timeline. */
function JobDetail({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["job", id], queryFn: () => api.get<Job>(`/jobs/${id}`) });
  const navigate = useNavigate();
  const sid = q.data?.sessionId;
  useEffect(() => {
    if (sid) void navigate({ to: "/sessions/$sid", params: { sid }, replace: true });
  }, [sid, navigate]);
  if (q.isLoading || sid) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const j = q.data!;
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

/** A background session opens full width at every size, with Back to Sessions. */
export function JobsPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  return (
    <div className="flex h-full flex-col">
      <BackBar />
      <div className="min-h-0 flex-1 overflow-auto">
        <JobDetail key={id} id={id} />
      </div>
    </div>
  );
}
