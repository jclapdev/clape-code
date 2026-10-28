// One page per conversation, at /sessions/<session id>: the whole transcript, approvals and questions where Claude
// stopped, and the reply box at the bottom. Sending resumes the conversation under the same ID when Claude isn't running.
import { type InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Archive, ArchiveRestore, ClipboardList, Copy,MoreHorizontal, Square, Trash2, Users } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { copyCommand, resumeCommand } from "@/lib/resume";
import { accountLabel } from "@/lib/format";
import { firstPage, keepDraft, pickProject, type NewSessionSearch } from "@/lib/newSession";
import type { PendingRequest, Project, Session, SlashCommand, Turn } from "@/lib/types";
import { useAccount } from "@/components/Account";
import { DetailHeader, PAGE_BAND, PAGE_COLUMN } from "@/components/Panes";
import { MessageBox } from "@/components/MessageBox";
import { SimpleSelect } from "@/components/SimpleSelect";
import { Transcript } from "@/components/Transcript";
import { ErrorNote, Loading, Switch, Tag, cn } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { BackBar, useSessionActions } from "./Sessions";
import { NEW_SESSION_DRAFT, adoptLinkedPrompt, draftKey, setKeptDraft, useDraft } from "@/lib/draft";

export const MODES = [
  { value: "default", label: "Ask before changes" },
  { value: "acceptEdits", label: "Accept edits" },
  { value: "plan", label: "Plan only" },
  { value: "auto", label: "Auto" },
];
export const MODELS = [
  { value: "", label: "Default model" },
  { value: "opus", label: "Opus" },
  { value: "sonnet", label: "Sonnet" },
  { value: "haiku", label: "Haiku" },
];

type Status = "starting" | "working" | "waiting" | "idle" | "error" | "stopped" | "running" | "done";
type Agent = { agentId: string; type: string | null; description: string | null };
type Page = Partial<Session> &
  Pick<Session, "sessionId" | "cwd" | "displayTitle" | "project"> & {
    turns: Turn[];
    totalTurns: number;
    offset: number;
    subagentList: Agent[];
    archived?: boolean;
    status: Status;
    liveId: string | null;
    pending: PendingRequest[];
    model: string | null;
    permissionMode: string | null;
    commands: SlashCommand[];
    /** The plan this conversation worked on, if any. */
    plan?: { path: string; title: string } | null;
  };

const TURNS_PER_PAGE = 1000;
/** Claude is busy, or a process (here or in a terminal) has the conversation open. */
const ACTIVE: Status[] = ["starting", "working", "waiting", "running"];
/** A Claude process started here is open and takes messages, approvals and setting changes directly. */
const OPEN: Status[] = ["starting", "working", "waiting", "idle"];

function stateOf(s: Status): [string, "accent" | "attn" | "ok" | "danger"] {
  if (s === "waiting") return ["Waiting for you", "attn"];
  if (s === "error") return ["Stopped with an error", "danger"];
  if (ACTIVE.includes(s)) return ["Working", "accent"];
  return ["Done", "ok"];
}

function useRespond(sid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: object) => api.post(`/sessions/${sid}/respond`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["session", sid] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

function ApprovalCard({ sid, r }: { sid: string; r: PendingRequest }) {
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState("");
  const respond = useRespond(sid);
  const send = (body: object) => respond.mutate({ requestId: r.requestId, ...body });
  const i = r.input ?? {};
  return (
    <section aria-label="Approval needed" className="flex flex-col gap-3 rounded-lg border border-attn-line bg-surface p-4">
      <div className="flex justify-between gap-2">
        <span className="text-[15px] font-semibold">Claude wants to {r.toolName === "Bash" ? "run a command" : r.toolName === "Write" ? "create a file" : r.toolName === "Edit" ? "edit a file" : `use ${r.toolName}`}</span>
        <span className="font-mono text-xs text-muted-foreground">{r.toolName}</span>
      </div>
      {r.toolName === "Bash" ? (
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-sunken px-3 py-2 font-mono text-[13px]">{i.command}</pre>
      ) : r.toolName === "Edit" ? (
        <div className="flex flex-col gap-1 font-mono text-[12.5px]">
          <span className="break-all text-muted-foreground">{i.file_path}</span>
          <pre className="whitespace-pre-wrap break-all rounded bg-danger-soft px-2 py-1 text-danger">- {i.old_string}</pre>
          <pre className="whitespace-pre-wrap break-all rounded bg-ok-soft px-2 py-1 text-ok">+ {i.new_string}</pre>
        </div>
      ) : (
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-md bg-sunken px-3 py-2 font-mono text-[12.5px]">{r.summary || JSON.stringify(i, null, 2)}</pre>
      )}
      {i.description && <p className="text-[13px] text-ink-2">{i.description}</p>}
      {denying ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send({ decision: "deny", message: reason || undefined });
          }}
        >
          <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tell Claude why, or what to do instead" aria-label="Reason" className="min-w-0 flex-1" />
          <Button size="lg" type="submit" variant="destructive" busy={respond.isPending}>
            Deny
          </Button>
          <Button size="lg" variant="outline" onClick={() => setDenying(false)}>
            Back
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="lg" busy={respond.isPending} onClick={() => send({ decision: "allow" })}>
            Allow once
          </Button>
          {r.canAlwaysAllow && (
            <Button size="lg" variant="outline" onClick={() => send({ decision: "always" })}>
              Always allow in this project
            </Button>
          )}
          <Button size="lg" variant="outline" onClick={() => setDenying(true)}>
            Deny…
          </Button>
        </div>
      )}
    </section>
  );
}

function QuestionCard({ sid, r }: { sid: string; r: PendingRequest }) {
  const questions: { question: string; header: string; options: { label: string; description: string }[]; multiSelect: boolean }[] = r.input?.questions ?? [];
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const respond = useRespond(sid);
  const answers: Record<string, string | string[]> = {};
  for (const q of questions) {
    const typed = other[q.question]?.trim();
    const chosen = picks[q.question] ?? [];
    if (typed) answers[q.question] = q.multiSelect ? [...chosen, typed] : typed;
    else if (chosen.length) answers[q.question] = q.multiSelect ? chosen : chosen[0]!;
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
        <fieldset key={q.question} className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1 text-[14.5px]">
            {q.question} {q.multiSelect && <span className="text-xs text-muted-foreground">(choose any)</span>}
          </legend>
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
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
                  {o.description && <span className="text-[12.5px] text-ink-2">{o.description}</span>}
                </button>
              );
            })}
          </div>
          <Input value={other[q.question] ?? ""} onChange={(e) => setOther((o) => ({ ...o, [q.question]: e.target.value }))} placeholder="Or type your own answer" aria-label={`Your own answer to: ${q.question}`} />
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button size="lg" disabled={!complete} busy={respond.isPending} onClick={() => respond.mutate({ requestId: r.requestId, decision: "allow", answers })}>
          Send answer
        </Button>
        <Button size="lg" variant="outline" onClick={() => respond.mutate({ requestId: r.requestId, decision: "deny", message: "The user skipped the question." })}>
          Skip
        </Button>
      </div>
    </section>
  );
}

function SubagentDialog({ sid, agent, onClose }: { sid: string; agent: Agent | null; onClose: () => void }) {
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

/** An on/off switch with its name beside it. */
const textOf = (t: Turn) => ((t.blocks[0] as { text?: string } | undefined)?.text ?? "").trim();

const SELECT = "h-8 min-w-[130px] max-w-full text-[13px]";

/** The reply box at the bottom of the page, with its settings in the row under it. */
function Composer({ box, onSubmit, children }: { box: Omit<ComponentProps<typeof MessageBox>, "onSubmit">; onSubmit: () => void; children: ReactNode }) {
  return (
    <form
      className={`flex-none border-t border-line bg-panel pb-3 pt-2.5 ${PAGE_BAND}`}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className={`${PAGE_COLUMN} flex flex-col gap-2`}>
        <MessageBox {...box} onSubmit={onSubmit} />
        <div className="flex flex-wrap gap-2">{children}</div>
      </div>
    </form>
  );
}

function Conversation({ sid }: { sid: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { archive, askDelete } = useSessionActions();
  const [details, setDetails] = useState(false);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [text, setText] = useDraft(draftKey("reply", sid), "");
  const [localMode, setLocalMode] = useState<string | null>(null);
  // A conversation started a moment ago on the New session page keeps the model picked there.
  const [model, setModel] = useState(() => {
    const m = qc.getQueryData<InfiniteData<Page>>(["session", sid])?.pages[0]?.model ?? "";
    return MODELS.some((x) => x.value === m) ? m : "";
  });
  // Messages sent from this page that the transcript doesn't show yet: the text and how many times it was there before.
  const [sent, setSent] = useState<{ text: string; before: number; at: string }[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  const q = useInfiniteQuery({
    queryKey: ["session", sid],
    queryFn: ({ pageParam }) => api.get<Page>(`/sessions/${sid}?offset=${pageParam}&limit=${TURNS_PER_PAGE}`),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset + last.turns.length < last.totalTurns ? last.offset + last.turns.length : undefined),
    // Transcript changes arrive as server events; this catches status changes between them.
    refetchInterval: (qq) => (ACTIVE.includes(qq.state.data?.pages[0]?.status as Status) || sent.length ? 2500 : false),
  });
  // The whole conversation, from the first message: keep fetching until every turn is in.
  useEffect(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
  }, [q.hasNextPage, q.isFetchingNextPage, q]);

  const first = q.data?.pages[0];
  const turns = q.data?.pages.flatMap((p) => p.turns) ?? [];
  const count = (t: string) => turns.filter((x) => x.role === "user" && textOf(x) === t).length;
  const echoes = sent.filter((m) => count(m.text) <= m.before);
  useEffect(() => {
    if (echoes.length !== sent.length) setSent(echoes);
  }, [echoes, sent.length]);
  const status = first?.status ?? "done";
  const open = OPEN.includes(status);
  const active = ACTIVE.includes(status);
  // Another Claude Code has it open: sending from here continues in a copy, so the two don't mix into one transcript.
  const elsewhere = status === "running";
  const mode = (open ? first?.permissionMode : (localMode ?? first?.permissionMode)) ?? "default";
  const pending = first?.pending ?? [];

  const fallbackCmds = useQuery({
    queryKey: ["live-commands", first?.project ?? ""],
    queryFn: () => api.get<SlashCommand[]>(`/live-commands?project=${encodeURIComponent(first?.project ?? "")}`),
    enabled: !!first && !first.commands.length,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["session", sid] });
    qc.invalidateQueries({ queryKey: ["live"] });
    qc.invalidateQueries({ queryKey: ["overview"] });
  };
  const send = useMutation({
    mutationFn: (t: string) => api.post<{ liveId: string; copy?: boolean }>(`/sessions/${sid}/send`, { text: t, model: model || undefined, permissionMode: mode, copy: elsewhere }),
    onSuccess: (r) => {
      refresh();
      // The copy's session ID comes from Claude's first message; its old-style live address opens the copy once it's known.
      if (r.copy) void navigate({ to: "/live/$id", params: { id: r.liveId } });
    },
    onError: (e: Error, t) => {
      toast.error(e.message);
      setSent((s) => s.filter((m) => m.text !== t.trim()));
      setText((cur) => cur || t);
    },
  });
  const call = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: object }) => api.post(`/sessions/${sid}/${path}`, body ?? {}),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    atBottom.current = true;
    setSent((s) => [...s, { text: t, before: count(t), at: new Date().toISOString() }]);
    setText("");
    send.mutate(text);
  };

  // Follow the conversation as it grows, unless you've scrolled up to read.
  const growth = `${turns.length}:${turns.at(-1)?.blocks.length ?? 0}:${pending.length}:${echoes.length}:${active}`;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [growth, details]);

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const s = first!;
  const [label, tone] = stateOf(status);
  const cmd = s.resumeCommand ?? resumeCommand(s.cwd, sid);
  const echoTurns: Turn[] = echoes.map((m, i) => ({ uuid: `sent-${i}`, role: "user", at: m.at, blocks: [{ kind: "text", text: m.text }] }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DetailHeader
        fixed
        title={s.displayTitle}
        sub={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Tag tone={tone}>{label}</Tag>
            {s.project ? (
              <Link to="/projects/$id" params={{ id: s.project }} search={{}}>
                {s.project.split("/").pop()}
              </Link>
            ) : (
              s.cwd && <span className="break-all">{s.cwd}</span>
            )}
            {s.plan && (
              <Link to="/plans" search={{ item: s.plan.path }} className="inline-flex min-w-0 items-center gap-1">
                <ClipboardList className="size-3.5 flex-none" aria-label="Plan" />
                <span className="break-words">{s.plan.title}</span>
              </Link>
            )}
            {s.copyOf && (
              <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
                <Tag>Copy</Tag>
                <span>
                  of{" "}
                  <Link to="/sessions/$sid" params={{ sid: s.copyOf.sessionId }} className="break-words">
                    {s.copyOf.title ?? "the original conversation"}
                  </Link>
                </span>
              </span>
            )}
            {s.archived && <span>Archived</span>}
          </span>
        }
        actions={
          <>
            <Switch label="Show details" on={details} onChange={setDetails} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-w-[min(420px,90vw)]">
                <DropdownMenuItem onSelect={() => copyCommand(cmd)}>
                  <Copy /> Copy command for the terminal
                </DropdownMenuItem>
                {s.subagentList.map((a) => (
                  <DropdownMenuItem key={a.agentId} onSelect={() => setAgent(a)}>
                    <Users />
                    <span className="truncate">
                      Subagent {a.type}: {a.description}
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => archive.mutate({ ids: [sid], archived: !s.archived })}>
                  {s.archived ? <ArchiveRestore /> : <Archive />} {s.archived ? "Unarchive" : "Archive"}
                </DropdownMenuItem>
                {!active && (
                  <DropdownMenuItem variant="destructive" onSelect={() => void askDelete([sid]).then((ok) => void (ok && navigate({ to: "/sessions", search: {} })))}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]"
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        <div className={`${PAGE_COLUMN} flex flex-col gap-3 py-5`}>
          {turns.length + echoTurns.length > 0 ? <Transcript turns={[...turns, ...echoTurns]} details={details} /> : !active && <Transcript turns={[]} />}
          {q.hasNextPage && <Loading />}
          {pending.map((r) => (r.type === "question" ? <QuestionCard key={r.requestId} sid={sid} r={r} /> : <ApprovalCard key={r.requestId} sid={sid} r={r} />))}
          {active && !pending.length && (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Spinner /> {elsewhere ? "Open in another Claude Code window. A message sent from here continues in a copy of this conversation, so that window's isn't changed." : "Claude is working"}
            </div>
          )}
          {status === "error" && (
            <div className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-[13.5px] text-danger">
              Claude stopped with an error. Send a message to try again.
            </div>
          )}
        </div>
      </div>
      <Composer
        onSubmit={submit}
        box={{
          value: text,
          onChange: setText,
          commands: s.commands.length ? s.commands : (fallbackCmds.data ?? []),
          placeholder: elsewhere ? "Continue in a copy of this conversation" : active ? "Send a message while Claude works" : "Reply to Claude, or type / for a command",
          busy: send.isPending,
          extra: open && status !== "idle" && (
            <Button size="lg" type="button" variant="outline" onClick={() => call.mutate({ path: "stop" })} busy={call.isPending && call.variables?.path === "stop"}>
              <Square className="size-3.5 fill-current" aria-hidden /> Stop
            </Button>
          ),
        }}
      >
        <SimpleSelect
          label="Model"
          value={model}
          onChange={(m) => {
            setModel(m);
            if (open) call.mutate({ path: "model", body: { model: m } });
          }}
          options={MODELS}
          className={SELECT}
        />
        <SimpleSelect
          label="Permission mode"
          value={mode}
          onChange={(m) => {
            setLocalMode(m);
            if (open) call.mutate({ path: "mode", body: { mode: m } });
          }}
          options={MODES}
          className={SELECT}
        />
      </Composer>
      <SubagentDialog sid={sid} agent={agent} onClose={() => setAgent(null)} />
    </div>
  );
}

export function ConversationPage() {
  const { sid } = useParams({ strict: false }) as { sid: string };
  return (
    <div className="flex h-full flex-col">
      <BackBar />
      <div className="min-h-0 flex-1">
        <Conversation key={sid} sid={sid} />
      </div>
    </div>
  );
}

/** A new conversation: the same page with nothing in it yet. The first message starts it, and the address becomes its own. */
function NewConversation({ search }: { search: NewSessionSearch }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/projects") });
  const [proj, setProj] = useState(search.project ?? "");
  const [model, setModel] = useState("");
  const [mode, setMode] = useState(search.mode ?? "default");
  // A prompt in the address, such as /init, goes in the box; what you had typed there is kept aside, offered back
  // here, and becomes the box's draft again once the linked prompt is sent.
  const [kept, setKept] = useState(() => adoptLinkedPrompt(search.prompt, keepDraft));
  const [text, setText, clearText] = useDraft(NEW_SESSION_DRAFT, "", search.prompt);
  const restoreKept = () => {
    const swap = text.trim() && text !== search.prompt ? text : null;
    setText(kept ?? "");
    setKeptDraft(swap);
    setKept(swap);
  };
  const account = useAccount(proj || undefined);
  const cmds = useQuery({ queryKey: ["live-commands", proj], queryFn: () => api.get<SlashCommand[]>(`/live-commands?project=${encodeURIComponent(proj)}`) });
  useEffect(() => {
    if (projects.data) setProj((cur) => cur || pickProject(projects.data, search.project));
  }, [projects.data, search.project]);

  const start = useMutation({
    mutationFn: (prompt: string) => api.post<{ sessionId: string; liveId: string | null }>("/sessions/new", { project: proj, model, permissionMode: mode, prompt }),
    onSuccess: (r, prompt) => {
      clearText();
      if (kept) {
        setText(kept);
        setKeptDraft(null);
      }
      if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
      // The conversation page opens with the message already in it, then fills in from the server.
      const page = firstPage({ sessionId: r.sessionId, liveId: r.liveId, project: proj, prompt, model, permissionMode: mode, at: new Date().toISOString() });
      qc.setQueryData<InfiniteData<Page>>(["session", r.sessionId], { pages: [page as unknown as Page], pageParams: [0] });
      qc.invalidateQueries({ queryKey: ["live"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      void navigate({ to: "/sessions/$sid", params: { sid: r.sessionId }, replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const submit = () => {
    if (!text.trim()) return;
    if (!proj) return void toast.error("Pick a project to run in.");
    start.mutate(text);
  };
  const options = (projects.data ?? []).filter((p) => !p.empty || p.id === proj).map((p) => ({ value: p.id, label: p.name }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DetailHeader fixed title="New session" sub={proj && account.data && !account.data.problem ? <span className="break-all">{accountLabel(account.data)}</span> : undefined} />
      <div className="min-h-0 flex-1" />
      {kept && (
        <div className={`flex-none ${PAGE_BAND}`}>
          <div className={`${PAGE_COLUMN} flex flex-wrap items-center gap-2 pb-2 text-[13px] text-muted-foreground`}>
            <span className="min-w-0 truncate">Your earlier draft: {kept.trim().split("\n")[0]}</span>
            <Button type="button" size="sm" variant="outline" onClick={restoreKept}>
              Use it instead
            </Button>
          </div>
        </div>
      )}
      <Composer
        onSubmit={submit}
        box={{
          value: text,
          onChange: setText,
          commands: cmds.data ?? [],
          placeholder: "What should Claude do? Type / for commands and skills.",
          busy: start.isPending,
        }}
      >
        <SimpleSelect label="Project" placeholder="Choose a project" value={proj} onChange={setProj} options={options} className={SELECT} />
        <SimpleSelect label="Model" value={model} onChange={setModel} options={MODELS} className={SELECT} />
        <SimpleSelect label="Permission mode" value={mode} onChange={setMode} options={MODES} className={SELECT} />
      </Composer>
    </div>
  );
}

export function NewSessionPage() {
  const search = useSearch({ strict: false }) as NewSessionSearch;
  return (
    <div className="flex h-full flex-col">
      <BackBar />
      <div className="min-h-0 flex-1">
        <NewConversation key={JSON.stringify(search)} search={search} />
      </div>
    </div>
  );
}
