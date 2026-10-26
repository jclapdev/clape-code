import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Page } from "@/components/Panes";
import { LiveRequestRow, SessionRow, useSessionEntries } from "@/components/SessionRows";
import { ErrorNote, Loading } from "@/components/ui";

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
        <SessionList />
      </div>
    </Page>
  );
}
