import { useSearch } from "@tanstack/react-router";
import { FileEditor } from "@/components/FileEditor";
import { DetailHeader } from "@/components/Panes";
import { Empty } from "@/components/ui";

export function FilePage() {
  const { path } = useSearch({ strict: false }) as { path?: string };
  if (!path) return <Empty title="No file chosen" />;
  const name = path.split(/[\\/]/).pop();
  return (
    <div className="h-full">
      <FileEditor key={path} path={path} header={<DetailHeader title={name} />} />
    </div>
  );
}
