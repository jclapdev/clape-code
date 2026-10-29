import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { Page } from "@/components/Panes";
import { ErrorNote, Loading, Md } from "@/components/ui";

export interface GuideInfo {
  slug: string;
  title: string;
  about: string;
  source: string;
}

/** One official guide, downloaded fresh and shown as formatted text. */
export function GuideText({ slug }: { slug: string }) {
  const q = useQuery({ queryKey: ["guide", slug], queryFn: () => api.get<GuideInfo & { text: string; url: string }>(`/guides/${slug}`), staleTime: 3600_000 });
  if (q.error) return <ErrorNote error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loading />;
  return (
    <article>
      <Md>{q.data.text}</Md>
      <p className="mt-6 text-[13px] text-muted-foreground">
        From{" "}
        <a href={q.data.url.replace(/\.md$/, "")} target="_blank" rel="noreferrer">
          {new URL(q.data.url).hostname}
        </a>
        , downloaded when you opened it.
      </p>
    </article>
  );
}

// Claude Code features that live in the cloud or an organization's admin console. Clape Code doesn't show
// or change them (BRIEF.md, What it will not do), so Guides links to their official pages.
const CLOUD = [
  { title: "Cloud scheduled tasks (routines)", about: "Prompts that run in the cloud on a schedule, on API calls or on GitHub events.", url: "https://code.claude.com/docs/en/routines" },
  { title: "Code Review on GitHub", about: "Claude reviews each pull request and comments inline. Team and Enterprise plans.", url: "https://code.claude.com/docs/en/code-review" },
  { title: "Claude Code in Slack", about: "Hand Claude a coding task by mentioning @Claude in a Slack channel.", url: "https://code.claude.com/docs/en/slack" },
  { title: "Gateways", about: "Route Claude Code through your organization's gateway for shared credentials and usage tracking.", url: "https://code.claude.com/docs/en/gateways" },
  { title: "Organization-managed settings", about: "Settings an organization's owners set for everyone from the claude.ai admin console.", url: "https://code.claude.com/docs/en/server-managed-settings" },
  { title: "Agent SDK", about: "Build your own agents in Python or TypeScript with Claude Code as a library.", url: "https://code.claude.com/docs/en/agent-sdk/overview" },
];

const CARD = "rounded-lg border border-line bg-surface px-4 py-3 text-ink no-underline hover:border-line-strong";

export function GuidesPage() {
  const { slug } = useParams({ strict: false }) as { slug?: string };
  const list = useQuery({ queryKey: ["guides"], queryFn: () => api.get<GuideInfo[]>("/guides"), enabled: !slug });
  if (slug)
    return (
      <div className="flex h-full flex-col">
        <Link to="/guides" className="flex h-11 flex-none items-center gap-1 border-b border-line px-3 text-[13.5px] no-underline">
          <ChevronLeft className="size-4" aria-hidden /> Guides
        </Link>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-[760px] px-6 py-8">
            <GuideText slug={slug} />
          </div>
        </div>
      </div>
    );
  return (
    <Page title="Guides">
      <div className="grid auto-rows-fr gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {(list.data ?? []).map((g) => (
          <Link key={g.slug} to="/guides/$slug" params={{ slug: g.slug }} className={CARD}>
            <span className="block font-medium">{g.title}</span>
            <span className="mt-1 block text-[13px] text-muted-foreground">{g.about}</span>
          </Link>
        ))}
      </div>
      <section aria-labelledby="cloud-guides" className="mt-10">
        <h2 id="cloud-guides" className="mb-3 text-[18px] font-semibold">
          In the cloud and your organization
        </h2>
        <div className="grid auto-rows-fr gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {CLOUD.map((g) => (
            <a key={g.url} href={g.url} target="_blank" rel="noreferrer" className={CARD}>
              <span className="flex items-center gap-1.5 font-medium">
                {g.title}
                <ExternalLink aria-label="Opens code.claude.com" className="size-3.5 flex-none text-muted-foreground" />
              </span>
              <span className="mt-1 block text-[13px] text-muted-foreground">{g.about}</span>
            </a>
          ))}
        </div>
      </section>
    </Page>
  );
}
