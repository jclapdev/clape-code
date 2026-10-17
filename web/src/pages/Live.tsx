import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { ago, modelName, money } from "@/lib/format";
import type { LiveSession, PendingRequest, Project, Session } from "@/lib/types";
import { DetailHeader, TwoPane } from "@/components/Panes";
import { Button, cn, Dot, Empty, ErrorNote, Md, Spinner, Tag, useToast } from "@/components/ui";

const MODES = [
  { value: "default", label: "Ask before changes" },
  { value: "acceptEdits", label: "Accept edits" },
  { value: "plan", label: "Plan only" },
  { value: "auto", label: "Auto" },
];
const MODELS = [
  { value: "", label: "Default model" },
  { value: "opus", label: "Opus" },
  { value: "sonnet", label: "Sonnet" },
  { value: "haiku", label: "Haiku" },
];
const STATUS: Record<LiveSession["status"], [string, "accent" | "attn" | "ok" | "muted" | "danger"]> = {
  starting: ["Starting", "muted"],
  working: ["Working", "accent"],
  waiting: ["Needs you", "attn"],
  idle: ["Finished its turn", "ok"],
  error: ["Stopped with an error", "danger"],
  stopped: ["Ended", "muted"],
};

const field = "h-9 rounded-md border border-line-strong bg-surface px-2.5 text-[13.5px] outline-none focus:border-accent";

function NewSession({ project, resume }: { project?: string; resume?: string }) {
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/projects") });
  const resumed = useQuery({ queryKey: ["session", resume], queryFn: () => api.get<Session>(`/sessions/${resume}`), enabled: !!resume });
  const [proj, setProj] = useState(project ?? "");
  const [model, setModel] = useState("");
  const [mode, setMode] = useState("default");
  const [prompt, setPrompt] = useState("");
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  useEffect(() => {
    setProj(project ?? "");
  }, [project]);

  const start = useMutation({
    mutationFn: () => api.post<LiveSession>("/live", { project: proj, resume, model, permissionMode: mode, prompt }),
    onSuccess: (s) => {
      if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
      qc.invalidateQueries({ queryKey: ["live"] });
      navigate({ to: "/live/$id", params: { id: s.id }, search: {} });
    },
    onError: (e: Error) => toast({ tone: "danger", text: e.message }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && (proj || resume)) start.mutate();
  };

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-6 py-8 md:pl-12">
      <h1 className="text-[22px] font-semibold">{resume ? "Resume a session" : "New session"}</h1>
      {resume ? (
        <div className="rounded-lg border border-line bg-surface px-4 py-3">
          <div className="font-medium">{resumed.data?.displayTitle ?? "Loading…"}</div>
          <div className="font-mono text-xs text-muted">{resumed.data?.cwd}</div>
        </div>
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-ink-2">Project</span>
          <select required value={proj} onChange={(e) => setProj(e.target.value)} className={field}>
            <option value="">Choose a project</option>
            {(projects.data ?? [])
              .filter((p) => !p.empty)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.path})
                </option>
              ))}
          </select>
        </label>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-ink-2">Model</span>
          <select value={model} onChange={(e) => setModel(e.target.value)} className={field}>
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-ink-2">Permissions</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)} className={field}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-ink-2">First message</span>
        <textarea
          required
          rows={6}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && submit(e)}
          placeholder="What should Claude do?"
          className="resize-y rounded-md border border-line-strong bg-surface p-3 text-[14.5px] leading-relaxed outline-none focus:border-accent"
        />
      </label>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted">Claude runs on this computer with your Claude Code settings. Approvals and questions appear here.</span>
        <Button type="submit" variant="primary" busy={start.isPending} disabled={!prompt.trim() || (!proj && !resume)}>
          Start
        </Button>
      </div>
    </form>
  );
}

function ApprovalCard({ id, r }: { id: string; r: PendingRequest }) {
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState("");
  const toast = useToast();
  const qc = useQueryClient();
  const respond = useMutation({
    mutationFn: (body: object) => api.post(`/live/${id}/respond`, { requestId: r.requestId, ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["live"] }),
    onError: (e: Error) => toast({ tone: "danger", text: e.message }),
  });
  const i = r.input ?? {};
  return (
    <section aria-label="Approval needed" className="flex flex-col gap-3 rounded-lg border border-attn-line bg-surface p-4">
      <div className="flex justify-between gap-2">
        <span className="text-[15px] font-semibold">Claude wants to {r.toolName === "Bash" ? "run a command" : r.toolName === "Write" ? "create a file" : r.toolName === "Edit" ? "edit a file" : `use ${r.toolName}`}</span>
        <span className="font-mono text-xs text-muted">{r.toolName}</span>
      </div>
      {r.toolName === "Bash" ? (
        <pre className="overflow-x-auto rounded-md bg-sunken px-3 py-2 font-mono text-[13px]">{i.command}</pre>
      ) : r.toolName === "Edit" ? (
        <div className="flex flex-col gap-1 font-mono text-[12.5px]">
          <span className="text-muted">{i.file_path}</span>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-danger-soft px-2 py-1 text-danger">- {i.old_string}</pre>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-ok-soft px-2 py-1 text-ok">+ {i.new_string}</pre>
        </div>
      ) : (
        <pre className="max-h-56 overflow-auto rounded-md bg-sunken px-3 py-2 font-mono text-[12.5px]">{r.summary || JSON.stringify(i, null, 2)}</pre>
      )}
      {i.description && <p className="text-[13px] text-ink-2">{i.description}</p>}
      {denying ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            respond.mutate({ decision: "deny", message: reason || undefined });
          }}
        >
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tell Claude why, or what to do instead" aria-label="Reason" className={cn(field, "min-w-0 flex-1")} />
          <Button type="submit" variant="danger" busy={respond.isPending}>
            Deny
          </Button>
          <Button onClick={() => setDenying(false)}>Back</Button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" busy={respond.isPending} onClick={() => respond.mutate({ decision: "allow" })}>
            Allow once
          </Button>
          {r.canAlwaysAllow && <Button onClick={() => respond.mutate({ decision: "always" })}>Always allow in this project</Button>}
          <Button onClick={() => setDenying(true)}>Deny…</Button>
        </div>
      )}
    </section>
  );
}

function QuestionCard({ id, r }: { id: string; r: PendingRequest }) {
  const questions: { question: string; header: string; options: { label: string; description: string }[]; multiSelect: boolean }[] = r.input?.questions ?? [];
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const toast = useToast();
  const qc = useQueryClient();
  const respond = useMutation({
    mutationFn: (body: object) => api.post(`/live/${id}/respond`, { requestId: r.requestId, ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["live"] }),
    onError: (e: Error) => toast({ tone: "danger", text: e.message }),
  });
  const answers: Record<string, string | string[]> = {};
  for (const q of questions) {
    const typed = other[q.question]?.trim();
    const chosen = picks[q.question] ?? [];
    if (typed) answers[q.question] = q.multiSelect ? [...chosen, typed] : typed;
    else if (chosen.length) answers[q.question] = q.multiSelect ? chosen : chosen[0];
  }
  const complete = questions.every((q) => answers[q.question] !== undefined);
  const pick = (q: (typeof questions)[number], label: string) =>
    setPicks((p) => {
      const cur = p[q.question] ?? [];
      return { ...p, [q.question]: q.multiSelect ? (cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label]) : [label] };
    });

  return (
    <section aria-label="Claude asks" className="flex flex-col gap-4 rounded-lg border border-accent-line bg-surface p-4">
      <span className="text-[15px] font-semibold">Claude asks</span>
      {questions.map((q) => (
        <fieldset key={q.question} className="flex flex-col gap-2">
          <legend className="mb-1 text-[14.5px]">
            {q.question} {q.multiSelect && <span className="text-xs text-muted">(choose any)</span>}
          </legend>
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            {q.options.map((o) => {
              const on = (picks[q.question] ?? []).includes(o.label);
              return (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pick(q, o.label)}
                  className={cn("flex min-h-11 flex-col gap-0.5 rounded-lg border px-3.5 py-2.5 text-left", on ? "border-accent bg-accent-soft" : "border-line-strong hover:border-accent-line")}
                >
                  <span className="text-[14px] font-semibold text-ink">{o.label}</span>
                  <span className="text-[12.5px] text-ink-2">{o.description}</span>
                </button>
              );
            })}
          </div>
          <input value={other[q.question] ?? ""} onChange={(e) => setOther((o) => ({ ...o, [q.question]: e.target.value }))} placeholder="Or type your own answer" aria-label={`Your own answer to: ${q.question}`} className={field} />
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={!complete} busy={respond.isPending} onClick={() => respond.mutate({ decision: "allow", answers })}>
          Send answer
        </Button>
        <Button onClick={() => respond.mutate({ decision: "deny", message: "The user skipped the question." })}>Skip</Button>
      </div>
    </section>
  );
}

function LiveView({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["live", id], queryFn: () => api.get<LiveSession>(`/live/${id}`), refetchInterval: (qq) => (qq.state.data?.status === "working" ? 3000 : false) });
  const [text, setText] = useState("");
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const bottom = useRef<HTMLDivElement>(null);
  const call = useMutation({
    mutationFn: ({ path, body, method }: { path: string; body?: object; method?: "delete" }) => (method === "delete" ? api.del(`/live/${id}`) : api.post(`/live/${id}/${path}`, body ?? {})),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["live"] }),
    onError: (e: Error) => toast({ tone: "danger", text: e.message }),
  });
  const n = q.data?.events.length ?? 0;
  const p = q.data?.pending.length ?? 0;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [n, p]);
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorNote error={q.error} />;
  const s = q.data!;
  const [label, tone] = STATUS[s.status];
  const ended = s.status === "stopped" || s.status === "error";

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim()) return;
    call.mutate({ path: "send", body: { text } });
    setText("");
  };

  return (
    <div className="flex h-full flex-col">
      <DetailHeader
        title={<span className="font-mono text-[17px]">{s.cwd}</span>}
        sub={
          <span className="flex items-center gap-2">
            <Dot tone={tone} /> {label}
            {s.model && <span>· {modelName(s.model)}</span>}
            <span>· started {ago(s.startedAt)}</span>
          </span>
        }
        actions={
          <>
            <label className="sr-only" htmlFor="pm">
              Permissions
            </label>
            <select id="pm" disabled={ended} value={s.permissionMode} onChange={(e) => call.mutate({ path: "mode", body: { mode: e.target.value } })} className={field}>
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            {!ended && (
              <Button size="sm" onClick={() => call.mutate({ path: "interrupt" })} disabled={s.status !== "working"}>
                Interrupt
              </Button>
            )}
            <Button
              size="sm"
              variant={ended ? "default" : "danger"}
              onClick={() => {
                call.mutate({ path: "", method: "delete" });
                navigate({ to: "/live", search: {} });
              }}
            >
              {ended ? "Close" : "Stop"}
            </Button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex w-full max-w-[860px] flex-col gap-3 px-6 py-5 md:pl-12">
          {s.events.map((e, i) => {
            if (e.kind === "user")
              return (
                <article key={i} className="rounded-lg border border-accent-line bg-accent-soft/40 px-4 py-3">
                  <div className="mb-1 text-xs font-semibold text-accent-strong">You</div>
                  <div className="whitespace-pre-wrap">{e.text}</div>
                </article>
              );
            if (e.kind === "text")
              return (
                <article key={i} className="rounded-lg border border-line bg-surface px-4 py-3">
                  <Md>{e.text}</Md>
                </article>
              );
            if (e.kind === "tool")
              return (
                <details key={i} className="rounded-md border border-line bg-sunken/50 px-3 py-1.5 text-[13px]">
                  <summary className="flex cursor-pointer items-baseline gap-3">
                    <span className={cn("w-16 flex-none font-medium", e.isError ? "text-danger" : "text-muted")}>{e.name}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-2">{e.summary}</span>
                    {e.result === undefined && <span className="text-xs text-muted">running…</span>}
                  </summary>
                  {e.result !== undefined && <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap font-mono text-[12px] text-ink-2">{e.result || "(no output)"}</pre>}
                </details>
              );
            if (e.kind === "result")
              return (
                <div key={i} className="py-1 text-center text-xs text-muted">
                  {e.isError ? `Turn ended: ${e.text}` : "Turn finished"}
                  {e.costUSD != null && `, ${money(e.costUSD)} so far`}
                </div>
              );
            return (
              <div key={i} className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-danger">
                {e.text}
              </div>
            );
          })}
          {s.pending.map((r) => (r.type === "question" ? <QuestionCard key={r.requestId} id={s.id} r={r} /> : <ApprovalCard key={r.requestId} id={s.id} r={r} />))}
          {s.status === "working" && !p && <div className="text-[13px] text-muted">Claude is working…</div>}
          <div ref={bottom} />
        </div>
      </div>
      {!ended && (
        <form onSubmit={send} className="border-t border-line bg-panel px-4 py-3">
          <div className="mx-auto flex max-w-[860px] items-end gap-2">
            <label htmlFor="msg" className="sr-only">
              Message Claude
            </label>
            <textarea
              id="msg"
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
              placeholder={s.status === "working" ? "Send a follow-up while it works…" : "Reply to Claude…"}
              className="min-w-0 flex-1 resize-none rounded-md border border-line-strong bg-surface p-2.5 outline-none focus:border-accent"
            />
            <Button type="submit" variant="primary" disabled={!text.trim()}>
              Send
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function LiveList({ selected }: { selected: string | null }) {
  const q = useQuery({ queryKey: ["live"], queryFn: () => api.get<LiveSession[]>("/live") });
  return (
    <div className="flex flex-col gap-1 px-2 py-4">
      <Link to="/live" search={{ new: "1" }} className="mx-2 mb-3 inline-flex h-9 items-center justify-center rounded-md border border-accent bg-accent text-[13.5px] font-medium text-on-accent no-underline hover:bg-accent-strong">
        New session
      </Link>
      {(q.data ?? []).map((s) => {
        const [label, tone] = STATUS[s.status];
        return (
          <Link key={s.id} to="/live/$id" params={{ id: s.id }} search={{}} className={cn("flex flex-col gap-0.5 rounded-md px-2.5 py-2 text-ink no-underline hover:bg-sunken", selected === s.id && "bg-surface shadow-[0_0_0_1px_var(--line-strong)]")}>
            <span className="flex items-center gap-2">
              <Dot tone={tone} />
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{s.cwd.split("/").pop()}</span>
              {s.pending.length > 0 && <Tag tone="attn">Needs you</Tag>}
            </span>
            <span className="truncate pl-4 text-xs text-muted">
              {(s.events.find((e) => e.kind === "user") as any)?.text ?? ""} · {label.toLowerCase()}
            </span>
          </Link>
        );
      })}
      {q.data && !q.data.length && <p className="px-3 text-[13px] text-muted">Sessions you start here appear in this list while the app is running.</p>}
    </div>
  );
}

export function LivePage() {
  const { id } = useParams({ strict: false }) as { id?: string };
  const s = useSearch({ strict: false }) as { new?: string; project?: string; resume?: string };
  const navigate = useNavigate();
  const showNew = !id && (s.new === "1" || !!s.resume);
  return (
    <TwoPane
      id="live"
      listLabel="Live sessions"
      hasSelection={!!id || showNew}
      onBack={() => navigate({ to: "/live", search: {} })}
      list={<LiveList selected={id ?? null} />}
      detail={id ? <LiveView key={id} id={id} /> : showNew ? <NewSession project={s.project} resume={s.resume} /> : <Empty title="Run Claude from here">Start a session in any project. When Claude asks for permission or has a question, it shows up here and on Home.</Empty>}
    />
  );
}
