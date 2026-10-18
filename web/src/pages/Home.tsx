import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { featureById, type Feature, type FeatureId } from "@/lib/features";
import { Page } from "@/components/Panes";
import { LiveRequestRow, SessionRow, useSessionEntries } from "@/components/SessionRows";
import { ErrorNote, Loading } from "@/components/ui";

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

function SessionList() {
  const { requests, entries, isLoading, error } = useSessionEntries();
  const first = entries.filter((e) => e.status === "needs" || e.status === "paused").sort((a, b) => (a.status === b.status ? 0 : a.status === "needs" ? -1 : 1));
  const recent = entries.filter((e) => !first.includes(e)).slice(0, 6);
  const empty = !requests.length && !first.length && !recent.length;

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
      {error && <ErrorNote error={error} />}
      {isLoading && <Loading />}
      {!isLoading && empty && <p className="text-[13.5px] text-muted-foreground">No sessions yet. Press "New session" to give Claude a task.</p>}
      {!isLoading && !empty && (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {requests.map((r) => (
            <LiveRequestRow key={"live" + r.id} item={r} />
          ))}
          {[...first, ...recent].map((e) => (
            <SessionRow key={e.key} e={e} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function HomePage() {
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

        <SessionList />
      </div>
    </Page>
  );
}
