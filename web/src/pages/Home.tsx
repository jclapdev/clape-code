import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ago, when } from "@/lib/format";
import { featureById, type Feature, type FeatureId } from "@/lib/features";
import type { PendingRequest, Session } from "@/lib/types";
import { Page } from "@/components/Panes";
import { ErrorNote, Loading, Tag } from "@/components/ui";

interface Overview {
  needsYou: (
    | { type: "live"; id: string; cwd: string; request: PendingRequest; at: string }
    | { type: "job"; id: string; name: string | null; cwd: string | null; detail: string | null; sessionId: string | null; at: string | null }
  )[];
  paused: { id: string; name: string; cwd: string | null; sessionId: string | null; at: string | null }[];
}

/**
 * One card per row of the "Build your setup over time" table on code.claude.com/docs/en/features-overview
 * (checked 2026-10-18), in the docs' order. `when` is the docs' trigger; `then` is what to do, in plain words.
 * `create` overrides the feature's own New button where the docs point at something more specific.
 */
const SETUP: { feature: FeatureId; when: string; then: string; create?: { label: string; to: string; search: Record<string, string> } }[] = [
  { feature: "instructions", when: "Claude gets a convention or a command wrong twice.", then: "Write it into your instructions, which Claude reads at the start of every session." },
  { feature: "output-styles", when: "You keep asking Claude to be shorter, explain more or answer in the same shape.", then: "Set an output style, so every answer comes that way without asking." },
  { feature: "skills", when: "You keep typing the same prompt to start a task.", then: "Save it as a skill that you start by typing its name after /." },
  { feature: "skills", when: "You paste the same step-by-step procedure into a chat for the third time.", then: "Keep it as a skill, which Claude loads by itself when a request matches." },
  { feature: "mcp", when: "You keep copying things from a browser tab that Claude can't see.", then: "Connect that service as an MCP server, so Claude can read it directly." },
  {
    feature: "plugins",
    when: "Claude reads many files to find where a name in your code is defined or used.",
    then: "Install a code intelligence plugin for your language, so Claude can jump straight there.",
    create: { label: "Find plugins", to: "/plugins", search: { panel: "find" } },
  },
  { feature: "agents", when: "A side task fills your chat with output you won't look at again.", then: "Hand it to an agent, which works separately and brings back only a summary." },
  { feature: "hooks", when: "You want something to happen every time, without asking for it.", then: "Add a hook: a command Claude Code runs at a set moment, such as after every edit." },
  {
    feature: "plugins",
    when: "A second project needs the same setup.",
    then: "Bundle your skills, agents and hooks into a plugin and install it there.",
    create: { label: "New plugin", to: "/plugins", search: { panel: "new" } },
  },
];

function SetupCard({ f, when: trigger, then, create }: { f: Feature; when: string; then: string; create?: { label: string; to: string; search: Record<string, string> } }) {
  const c = create ?? f.create;
  const Icon = f.icon;
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
        <Icon className="size-4 flex-none" aria-hidden />
        {f.label}
      </div>
      <div className="flex-1">
        <p className="font-medium text-ink">{trigger}</p>
        <p className="mt-1 text-[13.5px] text-ink-2">{then}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {c && (
          <Button asChild size="sm" className="no-underline">
            <Link to={c.to as never} search={c.search as never}>
              {c.label}
            </Link>
          </Button>
        )}
        <Link to={`/${f.id}` as never} search={{} as never} className="inline-flex items-center gap-1 text-[13px]">
          Open {f.label}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </li>
  );
}

const folder = (cwd: string | null) => (cwd ? cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd : null);

/** One line in the session list: what it is, where and when, a tag, and what you can do. */
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

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

function LiveRequestRow({ item }: { item: Extract<Overview["needsYou"][number], { type: "live" }> }) {
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

function SessionList({ o }: { o: Overview }) {
  const recent = useQuery({ queryKey: ["sessions", "home"], queryFn: () => api.get<Session[]>("/sessions") });
  const shownIds = new Set([...o.needsYou.flatMap((n) => (n.type === "job" && n.sessionId ? [n.sessionId] : [])), ...o.paused.flatMap((p) => (p.sessionId ? [p.sessionId] : []))]);
  const sessions = (recent.data ?? []).filter((s) => !shownIds.has(s.sessionId)).slice(0, 6);
  const empty = !o.needsYou.length && !o.paused.length && !sessions.length;

  return (
    <section aria-labelledby="home-sessions" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="home-sessions" className="text-[17px] font-semibold">
          Sessions
        </h2>
        <Link to="/sessions" search={{} as never} className="inline-flex items-center gap-1 text-[13px]">
          All sessions
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      {recent.error && <ErrorNote error={recent.error} />}
      {recent.isLoading && <Loading />}
      {!recent.isLoading && empty && <p className="text-[13.5px] text-muted-foreground">No sessions yet. Press "New session" to give Claude a task.</p>}
      {!empty && (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {o.needsYou.map((n) =>
            n.type === "live" ? (
              <LiveRequestRow key={"live" + n.id} item={n} />
            ) : (
              <Row key={"job" + n.id} tag={<Tag tone="attn">Needs you</Tag>} title={n.name ?? "Background session"} about={join(folder(n.cwd), n.detail || "Stopped and waiting for an answer before it can go on.")}>
                {n.sessionId && (
                  <Button asChild size="sm" className="no-underline">
                    <Link to="/live" search={{ new: "1", resume: n.sessionId } as never}>
                      Answer
                    </Link>
                  </Button>
                )}
                <Button asChild size="sm" variant="outline" className="no-underline">
                  <Link to="/jobs/$id" params={{ id: n.id }}>
                    Open
                  </Link>
                </Button>
              </Row>
            ),
          )}
          {o.paused.map((p) => (
            <Row key={"paused" + p.id} tag={<Tag tone="accent">Paused</Tag>} title={p.name} about={join(folder(p.cwd), "Stopped by a usage limit that has since reset", when(p.at))}>
              {p.sessionId && (
                <Button asChild size="sm" className="no-underline">
                  <Link to="/live" search={{ resume: p.sessionId } as never}>
                    Continue
                  </Link>
                </Button>
              )}
              <Button asChild size="sm" variant="outline" className="no-underline">
                <Link to="/jobs/$id" params={{ id: p.id }}>
                  Open
                </Link>
              </Button>
            </Row>
          ))}
          {sessions.map((s) => (
            <Row key={s.sessionId} tag={s.running ? <Tag tone="ok">Running</Tag> : undefined} title={s.displayTitle} about={join(folder(s.cwd), when(s.lastAt))}>
              {!s.running && (
                <Button asChild size="sm" variant="outline" className="no-underline">
                  <Link to="/live" search={{ resume: s.sessionId } as never}>
                    Continue
                  </Link>
                </Button>
              )}
              <Button asChild size="sm" variant="outline" className="no-underline">
                <Link to="/sessions/$sid" params={{ sid: s.sessionId }} search={{} as never}>
                  Open
                </Link>
              </Button>
            </Row>
          ))}
        </ul>
      )}
    </section>
  );
}

export function HomePage() {
  const q = useQuery({ queryKey: ["overview"], queryFn: () => api.get<Overview>("/overview") });
  return (
    <Page
      title="Control Center"
      sub="See and change everything that shapes how Claude Code works: its instructions, skills, agents, hooks and connections, across all your projects. Track each project's tasks, and run sessions from here."
      actions={
        <Button asChild size="lg" className="no-underline">
          <Link to="/live" search={{ new: "1" } as never}>
            New session
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-10">
        <section aria-labelledby="home-setup" className="flex flex-col gap-3">
          <div>
            <h2 id="home-setup" className="text-[17px] font-semibold">
              Build your setup
            </h2>
            <p className="mt-1 max-w-[70ch] text-[13.5px] text-muted-foreground">
              You don't need to set everything up at once. Each card below is a sign, taken from Claude Code's own guide, that one feature would help. Add it when you notice it happening.{" "}
              <Link to="/guides/$slug" params={{ slug: "features" }}>
                Read the guide
              </Link>
            </p>
          </div>
          <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
            {SETUP.map((s, i) => {
              const f = featureById(s.feature)!;
              return <SetupCard key={i} f={f} when={s.when} then={s.then} create={s.create} />;
            })}
          </ul>
        </section>

        {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} /> : <SessionList o={q.data!} />}
      </div>
    </Page>
  );
}
