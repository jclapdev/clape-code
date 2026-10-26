import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Page } from "@/components/Panes";
import { LiveRequestRow, Row, SessionRow, useSessionEntries } from "@/components/SessionRows";
import { api } from "@/lib/api";
import { ErrorNote, Loading } from "@/components/ui";

function SessionList() {
  const { requests, entries, isLoading, error } = useSessionEntries();
  const first = entries.filter((e) => e.status === "needs");
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

/** Prompts typed 3 or more times that no skill covers yet. Hidden when there are none. */
function Suggested() {
  const { data } = useQuery({ queryKey: ["suggested"], queryFn: () => api.get<{ prompt: string; name: string; count: number }[]>("/suggested") });
  if (!data?.length) return null;
  return (
    <section aria-labelledby="home-suggested" className="flex flex-col gap-3">
      <h2 id="home-suggested" className="text-[17px] font-semibold">
        Suggested
      </h2>
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {data.map((s) => (
          <Row key={s.prompt} title={<span title={s.prompt}>{s.prompt}</span>} about={`Typed ${s.count} times`}>
            <Button asChild size="sm" variant="outline" className="no-underline">
              <Link to="/new" search={{ kind: "skill", name: s.name, body: s.prompt } as never}>
                Make it a skill
              </Link>
            </Button>
          </Row>
        ))}
      </ul>
    </section>
  );
}

export function HomePage() {
  return (
    <Page
      title="Control Center"
      actions={
        <Button asChild size="lg" className="no-underline">
          <Link to="/sessions/new" search={{}}>
            New session
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-10">
        <SessionList />
        <Suggested />
      </div>
    </Page>
  );
}
