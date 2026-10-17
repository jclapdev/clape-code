import { useSearch } from "@tanstack/react-router";
import { FileEditor } from "@/components/FileEditor";
import { DetailHeader } from "@/components/Panes";
import { EmptyState } from "@/components/ui";

export function FilePage() {
  const { path } = useSearch({ strict: false }) as { path?: string };
  if (!path) return <EmptyState title="No file chosen" />;
  const name = path.split(/[\\/]/).pop();
  return (
    <div className="h-full">
      <FileEditor key={path} path={path} header={<DetailHeader title={name} />} />
    </div>
  );
}
