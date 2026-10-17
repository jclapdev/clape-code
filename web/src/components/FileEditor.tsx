import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError, enc } from "@/lib/api";
import { bytes, when } from "@/lib/format";
import type { FileData } from "@/lib/types";
import { DiffView, Editor } from "./Editor";
import { AccessTag, ErrorNote, Loading } from "./ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

export const fileQuery = (path: string) => ({
  queryKey: ["file", path],
  queryFn: () => api.get<FileData>(`/file?path=${enc(path)}`),
});

export async function openOnComputer(path: string, editor = true) {
  return api.post<{ ok: boolean; with: string }>("/open", { path, editor });
}

/**
 * View and edit one file. Saving sends the hash of the version that was loaded;
 * if the file changed on disk meanwhile, the server refuses and the conflict dialog shows both versions.
 */
export function FileEditor({ path, header, onSaved }: { path: string; header?: ReactNode; onSaved?: () => void }) {
  const q = useQuery(fileQuery(path));
  const qc = useQueryClient();
  const [text, setText] = useState<string | null>(null);
  const [base, setBase] = useState<{ content: string; hash: string | null } | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [conflict, setConflict] = useState<{ content: string; hash: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Take the server's version whenever there are no unsaved edits.
  useEffect(() => {
    if (!q.data || q.data.dir || q.data.content === null) return;
    const dirty = text !== null && base !== null && text !== base.content;
    if (!dirty) {
      setText(q.data.content);
      setBase({ content: q.data.content, hash: q.data.hash });
    } else if (q.data.hash !== base?.hash) {
      setConflict({ content: q.data.content, hash: q.data.hash });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data?.hash, path]);

  useEffect(() => {
    setText(null);
    setBase(null);
    setConflict(null);
    setError(null);
  }, [path]);

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const f = q.data!;
  if (f.dir) {
    return <div className="p-6 text-muted-foreground">This is a folder with {f.entries?.length ?? 0} items.</div>;
  }
  const editable = f.access === "edit";
  const dirty = text !== null && base !== null && text !== base.content;

  const save = async (overHash?: string | null) => {
    if (text === null || !base) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api.put<{ hash: string; backupPath: string | null }>("/file", { path, content: text, hash: overHash !== undefined ? overHash : base.hash });
      setBase({ content: text, hash: r.hash });
      setConflict(null);
      setDiffOpen(false);
      qc.setQueryData(["file", path], { ...f, content: text, hash: r.hash });
      toast.success(r.backupPath ? "Saved. The previous version was kept as a backup." : "Saved.");
      onSaved?.();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.current) setConflict(e.current);
      else setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {header}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-6 py-2 text-[12.5px] text-muted-foreground md:pl-12">
        <span className="min-w-0 truncate font-mono">{f.display}</span>
        <AccessTag access={f.access} />
        <span className="ml-auto">{when(f.mtime)} · {bytes(f.size)}</span>
        <Button variant="ghost" size="sm" onClick={() => openOnComputer(path).then((r) => toast.success(`Opened in ${r.with}.`), (e) => toast.error(e.message))}>
          <ExternalLink aria-hidden /> Open
        </Button>
      </div>
      {f.tooBig ? (
        <div className="p-6 text-muted-foreground">This file is too large to open here.</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">
          <Editor value={text ?? ""} onChange={setText} path={path} readOnly={!editable} onSave={() => editable && dirty && save()} />
        </div>
      )}
      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-panel px-4 py-2.5">
          <span className={dirty ? "text-attn" : "text-muted-foreground"}>{error ? <span className="text-danger">{error}</span> : dirty ? "Unsaved changes" : "No changes"}</span>
          <div className="flex gap-2">
            <Button variant="outline" disabled={!dirty} onClick={() => setDiffOpen(true)}>
              View changes
            </Button>
            <Button variant="outline" disabled={!dirty} onClick={() => base && setText(base.content)}>
              Discard
            </Button>
            <Button variant="default" disabled={!dirty} busy={saving} onClick={() => save()}>
              Save
            </Button>
          </div>
        </div>
      )}
      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Changes you are about to save</DialogTitle>
          </DialogHeader>
          {diffOpen && base && <DiffView before={base.content} after={text ?? ""} path={path} />}
          <DialogFooter>
            <Button size="lg" variant="outline" onClick={() => setDiffOpen(false)}>
              Keep editing
            </Button>
            <Button size="lg" busy={saving} onClick={() => save()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!conflict} onOpenChange={(o) => !o && setConflict(null)}>
        <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>This file changed on disk</DialogTitle>
            <DialogDescription>Something else changed this file after you opened it. Nothing was saved. Compare the two versions and choose one; replacing still keeps a backup.</DialogDescription>
          </DialogHeader>
          {conflict && <DiffView before={conflict.content} after={text ?? ""} path={path} />}
          <DialogFooter>
            <Button size="lg"
              variant="outline"
              onClick={() => {
                if (!conflict) return;
                setText(conflict.content);
                setBase(conflict);
                setConflict(null);
              }}
            >
              Use the version on disk
            </Button>
            <Button size="lg" variant="destructive" busy={saving} onClick={() => save(conflict?.hash ?? null)}>
              Replace it with mine
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
