import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { layoutStorage } from "@/lib/prefs";
import type { Project } from "@/lib/types";
import { SimpleSelect } from "./SimpleSelect";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Textarea } from "./ui/textarea";

// The note survives closing the box and changing page; storage can be unavailable, so layoutStorage guards each access.
const DRAFT = "cc-feedback-draft";
const LAST = "cc-feedback-project";
const ALL = "";

/** The project the page is about: a project page, else the one last picked here, else All projects. */
function useDefaultProject(projects: Project[]) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const seg = path.split("/").filter(Boolean);
  const onPage = seg[0] === "projects" && seg[1] && seg[1] !== "new" ? decodeURIComponent(seg[1]) : null;
  const known = (id: string | null) => (id && projects.some((p) => p.id === id) ? id : null);
  return known(onPage) ?? known(layoutStorage.getItem(LAST)) ?? ALL;
}

export function FeedbackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/projects") }).data ?? [];
  const fallback = useDefaultProject(projects);
  const [note, setNote] = useState(() => layoutStorage.getItem(DRAFT) ?? "");
  const [project, setProject] = useState(fallback);
  const [added, setAdded] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setProject(fallback);
    setAdded(null);
    setNote(layoutStorage.getItem(DRAFT) ?? "");
    // Only when the box opens: picking another project while it's open stays picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const write = (v: string) => {
    setNote(v);
    setAdded(null);
    layoutStorage.setItem(DRAFT, v);
  };

  const save = useMutation({
    mutationFn: () => api.post<{ n: number; path: string }>("/feedback", { project: project || null, note }),
    onSuccess: (r) => {
      write("");
      setAdded(r.n);
      if (project) layoutStorage.setItem(LAST, project);
      qc.invalidateQueries({ queryKey: ["project"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const options = [...projects.map((p) => ({ value: p.id, label: p.name })), { value: ALL, label: "All projects" }];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Feedback</DialogTitle>
        </DialogHeader>
        <form
          className="flex min-w-0 flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (note.trim() && !save.isPending) save.mutate();
          }}
        >
          <label htmlFor="feedback-note" className="sr-only">
            Note
          </label>
          <Textarea id="feedback-note" value={note} onChange={(e) => write(e.target.value)} placeholder="What should change?" rows={5} className="max-h-[50dvh] min-h-28 break-words" autoFocus />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <SimpleSelect id="feedback-project" label="Project" value={project} onChange={setProject} options={options} className="h-9 min-w-0 max-w-full flex-1 basis-48" />
            <Button type="submit" disabled={!note.trim() || save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
          {added !== null && (
            <p role="status" className="text-[14px] text-ok">
              Added as #{added}
            </p>
          )}
          {save.error && (
            <Alert variant="destructive">
              <AlertDescription>{(save.error as Error).message}</AlertDescription>
            </Alert>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
