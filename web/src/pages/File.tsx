import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { FileEditor, fileQuery } from "@/components/FileEditor";
import { DetailHeader, PAGE_COLUMN, PAGE_SCROLL } from "@/components/Panes";
import { EmptyState } from "@/components/ui";
import { lineOfKey } from "@/lib/jsonKey";

export function FilePage() {
  const { path, key } = useSearch({ strict: false }) as { path?: string; key?: string };
  // Same query as the editor's, so the file is read once; only needed to find the key's line.
  const q = useQuery({ ...fileQuery(path ?? ""), enabled: !!path && !!key });
  const line = key && q.data?.content ? lineOfKey(q.data.content, key) : undefined;
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
      <FileEditor key={path} path={path} line={line} header={<DetailHeader fixed title={name} />} />
    </div>
  );
}
