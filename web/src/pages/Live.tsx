import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { accountLabel, ago, modelName, money } from "@/lib/format";
import { useAccount } from "@/components/Account";
import type { LiveSession, PendingRequest, Project, Session, SlashCommand } from "@/lib/types";
import { DetailHeader } from "@/components/Panes";
import { Dot, ErrorNote, Loading, Md, cn } from "@/components/ui";
import { SimpleSelect } from "@/components/SimpleSelect";
import { Input } from "@/components/ui/input";
import { MessageBox } from "@/components/MessageBox";

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

function NewSession({ project, resume, initialPrompt, initialMode }: { project?: string; resume?: string; initialPrompt?: string; initialMode?: string }) {
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/projects") });
  const resumed = useQuery({ queryKey: ["session", resume], queryFn: () => api.get<Session>(`/sessions/${resume}`), enabled: !!resume });
  const [proj, setProj] = useState(project ?? "");
  const [model, setModel] = useState("");
  const [mode, setMode] = useState(initialMode ?? "default");
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const account = useAccount(proj || resumed.data?.project || undefined);
  const cmds = useQuery({ queryKey: ["live-commands", proj || resumed.data?.project || ""], queryFn: () => api.get<SlashCommand[]>(`/live-commands?project=${encodeURIComponent(proj || resumed.data?.project || "")}`) });
  const navigate = useNavigate();
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
    onError: (e: Error) => toast.error(e.message),
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
          <div className="text-xs text-muted-foreground">{resumed.data?.cwd}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-ink-2">Project</span>
          <SimpleSelect
            label="Project"
            placeholder="Choose a project"
            value={proj}
            onChange={setProj}
            className="w-full"
            options={(projects.data ?? []).filter((p) => !p.empty).map((p) => ({ value: p.id, label: `${p.name} (${p.path})` }))}
          />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-ink-2">Model</span>
          <SimpleSelect label="Model" value={model} onChange={setModel} options={MODELS} className="w-full" />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-ink-2">Permissions</span>
          <SimpleSelect label="Permissions" value={mode} onChange={setMode} options={MODES} className="w-full" />
        </div>
      </div>
      {(proj || resume) && account.data && !account.data.problem && (
        <div className="flex flex-wrap gap-x-2 text-[13px]">
          <span className="text-ink-2">Account</span>
          <span className="break-all">{accountLabel(account.data)}</span>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-ink-2">{resume ? "Your next message" : "First message"}</span>
        <MessageBox
          value={prompt}
          onChange={setPrompt}
          onSubmit={() => (proj || resume) && start.mutate()}
          commands={cmds.data ?? []}
          rows={6}
          placeholder="What should Claude do? Type / for commands and skills."
          submitLabel="Start"
          busy={start.isPending}
          disabled={!proj && !resume}
          enterSends={false}
        />
      </div>
      <p className="text-xs text-muted-foreground">Claude runs on this computer with your Claude Code settings. When it needs your approval or has a question, it shows up here and on Home.</p>
    </form>
  );
}

function ApprovalCard({ id, r }: { id: string; r: PendingRequest }) {
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const respond = useMutation({
    mutationFn: (body: object) => api.post(`/live/${id}/respond`, { requestId: r.requestId, ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["live"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const i = r.input ?? {};
  return (
    <section aria-label="Approval needed" className="flex flex-col gap-3 rounded-lg border border-attn-line bg-surface p-4">
      <div className="flex justify-between gap-2">
        <span className="text-[15px] font-semibold">Claude wants to {r.toolName === "Bash" ? "run a command" : r.toolName === "Write" ? "create a file" : r.toolName === "Edit" ? "edit a file" : `use ${r.toolName}`}</span>
        <span className="font-mono text-xs text-muted-foreground">{r.toolName}</span>
      </div>
      {r.toolName === "Bash" ? (
        <pre className="overflow-x-auto rounded-md bg-sunken px-3 py-2 font-mono text-[13px]">{i.command}</pre>
      ) : r.toolName === "Edit" ? (
        <div className="flex flex-col gap-1 font-mono text-[12.5px]">
          <span className="text-muted-foreground">{i.file_path}</span>
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
          <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tell Claude why, or what to do instead" aria-label="Reason" className="min-w-0 flex-1" />
          <Button size="lg" type="submit" variant="destructive" busy={respond.isPending}>
            Deny
          </Button>
          <Button size="lg" variant="outline" onClick={() => setDenying(false)}>Back</Button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="lg" variant="default" busy={respond.isPending} onClick={() => respond.mutate({ decision: "allow" })}>
            Allow once
          </Button>
          {r.canAlwaysAllow && <Button size="lg" variant="outline" onClick={() => respond.mutate({ decision: "always" })}>Always allow in this project</Button>}
          <Button size="lg" variant="outline" onClick={() => setDenying(true)}>Deny…</Button>
        </div>
      )}
    </section>
  );
}

function QuestionCard({ id, r }: { id: string; r: PendingRequest }) {
  const questions: { question: string; header: string; options: { label: string; description: string }[]; multiSelect: boolean }[] = r.input?.questions ?? [];
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const respond = useMutation({
    mutationFn: (body: object) => api.post(`/live/${id}/respond`, { requestId: r.requestId, ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["live"] }),
    onError: (e: Error) => toast.error(e.message),
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
    <section aria-label="Claude asks" className="flex flex-col gap-4 rounded-lg border border-primary-line bg-surface p-4">
      <span className="text-[15px] font-semibold">Claude asks</span>
      {questions.map((q) => (
        <fieldset key={q.question} className="flex flex-col gap-2">
          <legend className="mb-1 text-[14.5px]">
            {q.question} {q.multiSelect && <span className="text-xs text-muted-foreground">(choose any)</span>}
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
                  className={cn("flex min-h-11 flex-col gap-0.5 rounded-lg border px-3.5 py-2.5 text-left", on ? "border-primary bg-accent" : "border-line-strong hover:border-primary-line")}
                >
                  <span className="text-[14px] font-semibold text-ink">{o.label}</span>
                  <span className="text-[12.5px] text-ink-2">{o.description}</span>
                </button>
              );
            })}
          </div>
          <Input value={other[q.question] ?? ""} onChange={(e) => setOther((o) => ({ ...o, [q.question]: e.target.value }))} placeholder="Or type your own answer" aria-label={`Your own answer to: ${q.question}`} />
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button size="lg" variant="default" disabled={!complete} busy={respond.isPending} onClick={() => respond.mutate({ decision: "allow", answers })}>
          Send answer
        </Button>
        <Button size="lg" variant="outline" onClick={() => respond.mutate({ decision: "deny", message: "The user skipped the question." })}>Skip</Button>
      </div>
    </section>
  );
}

function LiveView({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["live", id], queryFn: () => api.get<LiveSession>(`/live/${id}`), refetchInterval: (qq) => (qq.state.data?.status === "working" ? 3000 : false) });
  const [text, setText] = useState("");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const bottom = useRef<HTMLDivElement>(null);
  const call = useMutation({
    mutationFn: ({ path, body, method }: { path: string; body?: object; method?: "delete" }) => (method === "delete" ? api.del(`/live/${id}`) : api.post(`/live/${id}/${path}`, body ?? {})),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["live"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const n = q.data?.events.length ?? 0;
  const p = q.data?.pending.length ?? 0;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [n, p]);
  if (q.isLoading) return <Loading />;
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
        title={(s.events.find((e) => e.kind === "user") as { text?: string } | undefined)?.text?.split("\n")[0]?.slice(0, 90) ?? "Session"}
        sub={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Dot tone={tone} /> {label}
            <span>· {s.cwd.split("/").pop()}</span>
            {s.model && <span>· {modelName(s.model)}</span>}
            <span>· started {ago(s.startedAt)}</span>
            {s.account && <span className="break-all">· {accountLabel(s.account)}</span>}
          </span>
        }
        actions={
          <>
            <SimpleSelect label="Permissions" disabled={ended} value={s.permissionMode} onChange={(mode) => call.mutate({ path: "mode", body: { mode } })} options={MODES} />
            {!ended && (
              <Button variant="outline" onClick={() => call.mutate({ path: "interrupt" })} disabled={s.status !== "working"}>
                Interrupt
              </Button>
            )}
            <Button
              variant={ended ? "outline" : "destructive"}
              onClick={() => {
                call.mutate({ path: "", method: "delete" });
                navigate({ to: "/sessions", search: {} });
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
                <article key={i} className="rounded-lg border border-primary-line bg-accent/40 px-4 py-3">
                  <div className="mb-1 text-xs font-semibold text-accent-foreground">You</div>
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
                    <span className={cn("w-16 flex-none font-medium", e.isError ? "text-danger" : "text-muted-foreground")}>{e.name}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-2">{e.summary}</span>
                    {e.result === undefined && <span className="text-xs text-muted-foreground">running…</span>}
                  </summary>
                  {e.result !== undefined && <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap font-mono text-[12px] text-ink-2">{e.result || "(no output)"}</pre>}
                </details>
              );
            if (e.kind === "result")
              return (
                <div key={i} className="py-1 text-center text-xs text-muted-foreground">
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
          {s.status === "working" && !p && <div className="text-[13px] text-muted-foreground">Claude is working…</div>}
          <div ref={bottom} />
        </div>
      </div>
      {!ended && (
        <form onSubmit={send} className="border-t border-line bg-panel px-4 py-3">
          <div className="mx-auto max-w-[860px]">
            <MessageBox
              value={text}
              onChange={setText}
              onSubmit={() => send()}
              commands={s.commands ?? []}
              placeholder={s.status === "working" ? "Send a follow-up while it works…" : "Reply to Claude, or type / for a command"}
            />
          </div>
        </form>
      )}
    </div>
  );
}

export function LivePage() {
  const { id } = useParams({ strict: false }) as { id?: string };
  const s = useSearch({ strict: false }) as { new?: string; project?: string; resume?: string; prompt?: string; mode?: string };
  return <div className="h-full overflow-auto">{id ? <LiveView key={id} id={id} /> : <NewSession project={s.project} resume={s.resume} initialPrompt={s.prompt} initialMode={s.mode} />}</div>;
}
