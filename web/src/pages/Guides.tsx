import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
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
    <Page title="Guides" sub="The official guides for Claude Code and for writing skills, shown here so you don't have to leave the app.">
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {(list.data ?? []).map((g) => (
          <Link key={g.slug} to="/guides/$slug" params={{ slug: g.slug }} className="rounded-lg border border-line bg-surface px-4 py-3 text-ink no-underline hover:border-line-strong">
            <span className="block font-medium">{g.title}</span>
            <span className="mt-1 block text-[13px] text-muted-foreground">{g.about}</span>
          </Link>
        ))}
      </div>
    </Page>
  );
}
