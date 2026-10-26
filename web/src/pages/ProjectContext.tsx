// Add context: files dropped on the project page or picked are copied into the project's docs/ folder.
// Each has a switch that adds or removes an `@docs/<file>` line in CLAUDE.md, which makes Claude read it
// at the start of every session (code.claude.com/docs/en/memory, "Import additional files").
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileUp } from "lucide-react";
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { api, ApiError, enc } from "@/lib/api";
import type { ProjectDetail } from "@/lib/types";
import { cn } from "@/components/ui";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 2 * 1024 * 1024;

const size = (n: number) => (n < 1024 ? (n === 1 ? "1 byte" : `${n} bytes`) : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Copies files into docs/ one at a time and says what happened to each. */
export function useContextUpload(p: ProjectDetail) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const upload = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    for (const f of files) {
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name} is ${size(f.size)}. Files up to 2 MB can be added.`);
        continue;
      }
      const form = new FormData();
      form.append("file", f);
      try {
        const r = await api.upload<{ name: string; renamed: boolean }>(`/projects/${enc(p.id)}/context`, form);
        toast.success(r.renamed ? `Added as docs/${r.name}.` : `Added docs/${r.name}.`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["project", p.id] });
  };
  return { upload, busy };
}

const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files");

/** Wraps the project page so a file dropped anywhere on it is added to docs/. */
export function ContextDropZone({ p, children }: { p: ProjectDetail; children: ReactNode }) {
  const { upload } = useContextUpload(p);
  const [over, setOver] = useState(false);
  return (
    <div
      className="relative"
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setOver(false);
        void upload([...e.dataTransfer.files]);
      }}
    >
      {children}
      {over && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-background/70 p-6">
          <div className="rounded-xl border-2 border-dashed border-primary bg-surface px-6 py-5 text-center">
            <FileUp aria-hidden className="mx-auto mb-2 size-6 text-primary" />
            <p className="font-medium">Drop to add to {p.name}/docs/</p>
            <p className="text-[13px] text-muted-foreground">Text files up to 2 MB</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn("relative inline-flex h-5 w-9 flex-none items-center rounded-full border border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50", on ? "bg-primary" : "bg-line-strong")}
    >
      <span className={cn("inline-block size-4 rounded-full bg-white shadow transition-transform", on ? "translate-x-4" : "translate-x-0.5")} />
    </button>
  );
}

export function ContextSection({ p }: { p: ProjectDetail }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const { upload, busy } = useContextUpload(p);
  const ctx = p.context;
  const toggle = useMutation({
    mutationFn: ({ name, on }: { name: string; on: boolean }) => api.post(`/projects/${enc(p.id)}/context/import`, { name, on, hash: ctx.claudeMd.hash }),
    onSuccess: (_r, v) => toast.success(v.on ? `Claude now reads docs/${v.name} every session.` : `Claude reads docs/${v.name} only when it needs it.`),
    onError: (e: Error) => toast.error(e instanceof ApiError && e.status === 409 ? `${ctx.claudeMd.display} changed on disk. It has been reloaded; try again.` : e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: ["project", p.id] }),
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-line-strong bg-surface px-4 py-4 sm:flex-row sm:items-center">
        <p className="flex-1 text-[13.5px] text-ink-2">
          Drop files anywhere on this page, or pick them, to copy them into <code>docs/</code>. Text files only (Markdown, plain text, code, CSV), up to 2 MB each.
        </p>
        <input
          ref={input}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            void upload([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <Button variant="outline" onClick={() => input.current?.click()} busy={busy} className="self-start sm:self-auto">
          <FileUp aria-hidden /> Pick files
        </Button>
      </div>
      {ctx.files.length > 0 ? (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {ctx.files.map((f) => (
            <li key={f.name} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <Link to="/file" search={{ path: f.path }} className="break-words font-medium [overflow-wrap:anywhere]">
                  docs/{f.name}
                </Link>
                <div className="text-[12.5px] text-muted-foreground">{size(f.size)}</div>
              </div>
              <label className="flex items-center gap-2 text-[13px] text-ink-2">
                <Switch on={f.imported} label={`Claude reads docs/${f.name} every session`} disabled={toggle.isPending} onChange={(on) => toggle.mutate({ name: f.name, on })} />
                Claude reads this every session
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13.5px] text-muted-foreground">No files in docs/ yet.</p>
      )}
      <p className="text-xs text-muted-foreground">
        The switch adds or removes an <code>@docs/…</code> line in {ctx.claudeMd.display}. With it off, Claude still finds the file when it needs it. Files read every session use up room in each conversation, so keep them short.
      </p>
    </div>
  );
}
