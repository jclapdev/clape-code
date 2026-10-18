import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { api } from "@/lib/api";
import { ErrorNote, Loading, Md, cn } from "@/components/ui";

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
  const list = useQuery({ queryKey: ["guides"], queryFn: () => api.get<GuideInfo[]>("/guides") });
  return (
    <div className="flex h-full">
      <nav aria-label="Guides" className="hidden w-72 flex-none overflow-auto border-r border-line bg-panel p-3 md:block">
        <h1 className="px-2 pb-2 pt-1 text-[18px] font-semibold">Guides</h1>
        <ul className="flex flex-col gap-0.5">
          {(list.data ?? []).map((g) => (
            <li key={g.slug}>
              <Link to="/guides/$slug" params={{ slug: g.slug }} className={cn("block rounded-md px-2.5 py-2 text-ink no-underline hover:bg-sunken", slug === g.slug && "bg-accent text-accent-foreground hover:bg-accent")}>
                <span className="block text-[14px] font-medium">{g.title}</span>
                <span className="block text-[12.5px] text-muted-foreground">{g.about}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[760px] px-6 py-8">
          {slug ? (
            <GuideText slug={slug} />
          ) : (
            <>
              <h1 className="text-[24px] font-semibold">Guides</h1>
              <p className="mt-1 text-muted-foreground">The official guides for Claude Code and for writing skills, shown here so you don't have to leave the app.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {(list.data ?? []).map((g) => (
                  <Link key={g.slug} to="/guides/$slug" params={{ slug: g.slug }} className="rounded-lg border border-line bg-surface px-4 py-3 text-ink no-underline hover:border-line-strong">
                    <span className="block font-medium">{g.title}</span>
                    <span className="mt-1 block text-[13px] text-muted-foreground">{g.about}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
