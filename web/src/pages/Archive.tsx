import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { api } from "@/lib/api";
import { when } from "@/lib/format";
import { Page } from "@/components/Panes";
import { EmptyState, ErrorNote, Loading, Tag } from "@/components/ui";
import { KIND_LABEL } from "./Library";

interface Rec {
  id: string;
  kind: keyof typeof KIND_LABEL | "file";
  name: string;
  originalPath: string;
  originalDisplay: string;
  archivedAt: string;
}

export function ArchivePage() {
  const q = useQuery({ queryKey: ["archive"], queryFn: () => api.get<Rec[]>("/archive") });
  const qc = useQueryClient();
  const restore = useMutation({
    mutationFn: (id: string) => api.post<Rec>(`/archive/${id}/restore`),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["archive"] });
      toast.success(`Restored ${r.name}. Claude Code will load it again.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Page
      title="Archive"
      sub="Skills, agents, commands, plans and notes you archived. Claude Code doesn't load them; restore puts each back where it came from."
      actions={
        <Button asChild variant="outline" size="lg" className="no-underline">
<Link to="/sessions" search={{ archived: "1" }}>
          Archived sessions
        </Link>
</Button>
      }
    >
      {q.isLoading && <Loading />}
      <ErrorNote error={q.error} />
      {q.data && !q.data.length && <EmptyState title="Nothing archived">Archive items from the Library to get them out of Claude's way without deleting them.</EmptyState>}
      {!!q.data?.length && (
        <ul className="overflow-hidden rounded-lg border border-line bg-surface">
          {q.data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              <Tag>{r.kind === "file" ? "File" : KIND_LABEL[r.kind][0]}</Tag>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{r.name}</div>
                <div className="truncate font-mono text-xs text-muted-foreground">{r.originalDisplay}</div>
              </div>
              <span className="text-xs text-muted-foreground">archived {when(r.archivedAt)}</span>
              <Button variant="outline" busy={restore.isPending && restore.variables === r.id} onClick={() => restore.mutate(r.id)}>
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
