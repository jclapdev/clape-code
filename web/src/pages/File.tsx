import { useSearch } from "@tanstack/react-router";
import { FileEditor } from "@/components/FileEditor";
import { DetailHeader, PAGE_COLUMN } from "@/components/Panes";
import { EmptyState } from "@/components/ui";

export function FilePage() {
  const { path } = useSearch({ strict: false }) as { path?: string };
  if (!path)
    return (
      <div className={PAGE_COLUMN}>
        <EmptyState title="No file chosen" />
      </div>
    );
  const name = path.split(/[\\/]/).pop();
  return (
    <div className="h-full">
      <FileEditor key={path} path={path} header={<DetailHeader fixed title={name} />} />
    </div>
  );
}
