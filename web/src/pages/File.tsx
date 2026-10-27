import { useSearch } from "@tanstack/react-router";
import { FileEditor } from "@/components/FileEditor";
import { DetailHeader, PAGE_COLUMN, PAGE_SCROLL } from "@/components/Panes";
import { EmptyState } from "@/components/ui";

export function FilePage() {
  const { path } = useSearch({ strict: false }) as { path?: string };
  if (!path)
    return (
      <div className={PAGE_SCROLL}>
        <div className={PAGE_COLUMN}>
          <EmptyState title="No file chosen" />
        </div>
      </div>
    );
  const name = path.split(/[\\/]/).pop();
  return (
    <div className="h-full">
      <FileEditor key={path} path={path} header={<DetailHeader fixed title={name} />} />
    </div>
  );
}
