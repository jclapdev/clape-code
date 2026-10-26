import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { accountLabel } from "@/lib/format";
import { useAccount } from "@/components/Account";
import type { LiveSession, Project, SlashCommand } from "@/lib/types";
import { ErrorNote, Loading } from "@/components/ui";
import { SimpleSelect } from "@/components/SimpleSelect";
import { MessageBox } from "@/components/MessageBox";
import { MODELS, MODES } from "./Conversation";

function NewSession({ project, initialPrompt, initialMode }: { project?: string; initialPrompt?: string; initialMode?: string }) {
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/projects") });
  const [proj, setProj] = useState(project ?? "");
  const [model, setModel] = useState("");
  const [mode, setMode] = useState(initialMode ?? "default");
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const account = useAccount(proj || undefined);
  const cmds = useQuery({ queryKey: ["live-commands", proj], queryFn: () => api.get<SlashCommand[]>(`/live-commands?project=${encodeURIComponent(proj)}`) });
  const navigate = useNavigate();
  const qc = useQueryClient();
  useEffect(() => {
    setProj(project ?? "");
  }, [project]);

  const start = useMutation({
    mutationFn: () => api.post<{ sessionId: string }>("/sessions/new", { project: proj, model, permissionMode: mode, prompt }),
    onSuccess: (s) => {
      if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
      qc.invalidateQueries({ queryKey: ["live"] });
      navigate({ to: "/sessions/$sid", params: { sid: s.sessionId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && proj) start.mutate();
  };

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-6 py-8 md:pl-12">
      <h1 className="text-[22px] font-semibold">New session</h1>
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
      {proj && account.data && !account.data.problem && (
        <div className="flex flex-wrap gap-x-2 text-[13px]">
          <span className="text-ink-2">Account</span>
          <span className="break-all">{accountLabel(account.data)}</span>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-ink-2">First message</span>
        <MessageBox
          value={prompt}
          onChange={setPrompt}
          onSubmit={() => proj && start.mutate()}
          commands={cmds.data ?? []}
          rows={6}
          placeholder="What should Claude do? Type / for commands and skills."
          submitLabel="Start"
          busy={start.isPending}
          disabled={!proj}
          enterSends={false}
        />
      </div>
      <p className="text-xs text-muted-foreground">Claude runs on this computer with your Claude Code settings. When it needs your approval or has a question, it shows up here and on Home.</p>
    </form>
  );
}

/** Old /live/<id> links: the conversation page for that live session's session ID. */
function LiveRedirect({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["live", id], queryFn: () => api.get<LiveSession>(`/live/${id}`) });
  const navigate = useNavigate();
  const sid = q.data?.sessionId;
  useEffect(() => {
    if (sid) void navigate({ to: "/sessions/$sid", params: { sid }, replace: true });
  }, [sid, navigate]);
  if (q.error)
    return (
      <div className="flex flex-col gap-3 px-6 py-8 md:pl-12">
        <ErrorNote error={q.error} />
        <Link to="/sessions" search={{}}>
          Sessions
        </Link>
      </div>
    );
  return <Loading />;
}

export function LivePage() {
  const { id } = useParams({ strict: false }) as { id?: string };
  const s = useSearch({ strict: false }) as { project?: string; prompt?: string; mode?: string };
  return <div className="h-full overflow-auto">{id ? <LiveRedirect key={id} id={id} /> : <NewSession project={s.project} initialPrompt={s.prompt} initialMode={s.mode} />}</div>;
}
