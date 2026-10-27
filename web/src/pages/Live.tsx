import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { api } from "@/lib/api";
import type { LiveSession } from "@/lib/types";
import { ErrorNote, Loading } from "@/components/ui";
import { PAGE_COLUMN, PAGE_SCROLL } from "@/components/Panes";

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
      <div className={`${PAGE_COLUMN} flex flex-col items-start gap-3 py-6`}>
        <ErrorNote error={q.error} className="w-full" />
        <Link to="/sessions" search={{}}>
          Sessions
        </Link>
      </div>
    );
  return <Loading />;
}

export function LivePage() {
  const { id } = useParams({ strict: false }) as { id: string };
  return (
    <div className={PAGE_SCROLL}>
      <LiveRedirect key={id} id={id} />
    </div>
  );
}
