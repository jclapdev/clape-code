// New project: a folder in one of the project folders, with git, a starter CLAUDE.md and an empty board.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Page } from "@/components/Panes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Created {
  id: string;
  name: string;
  git: boolean;
}

const NAME = /^[A-Za-z0-9][\w.-]{0,79}$/;

export function NewProjectPage() {
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: ["config"], queryFn: () => api.get<{ projectRoots: string[] }>("/config") });
  const root = (cfg.data?.projectRoots[0] ?? "~/projects").replace(/[\\/]+$/, "");
  const [name, setName] = useState("");
  const [folder, setFolder] = useState<string | null>(null); // null until edited: follows the name
  const shownFolder = folder ?? `${root}/${name}`;
  const nameOk = NAME.test(name);

  const create = useMutation({
    mutationFn: () => api.post<Created>("/projects-new", { name, folder: shownFolder }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["catalog"] });
    },
  });

  if (create.data) {
    const p = create.data;
    return (
      <Page title={`${p.name} is ready`} sub={p.id}>
        <div className="flex max-w-[640px] flex-col gap-5">
          <ul className="flex list-disc flex-col gap-1 pl-5 text-ink-2">
            <li>Made the folder {p.id}</li>
            <li>{p.git ? "Started a git repository in it" : "Didn't start a git repository: git isn't installed on this computer"}</li>
            <li>Wrote a starter CLAUDE.md, the instructions Claude reads every session</li>
            <li>Wrote a PROGRESS.md with empty Next, In progress and Done lists for the board</li>
          </ul>
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
            <p className="font-medium">Have Claude set it up</p>
            <p className="text-[13.5px] text-ink-2">Starts a session in the new folder with /init, which has Claude look at the project and fill in CLAUDE.md. Best once there are some files in it.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild className="no-underline">
                <Link to="/live" search={{ new: "1", project: p.id, prompt: "/init" }}>
                  Have Claude set it up
                </Link>
              </Button>
              <Button asChild variant="outline" className="no-underline">
                <Link to="/projects/$id" params={{ id: p.id }} search={{}}>
                  Open the project
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </Page>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (nameOk) create.mutate();
  };

  return (
    <Page title="New project" sub="A folder for the project, ready for Claude: git, a starter CLAUDE.md and an empty board.">
      <form onSubmit={submit} className="flex max-w-[640px] flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="np-name" className="text-[14px] font-medium">
            Name
          </label>
          <p className="text-[13px] text-muted-foreground">Letters, numbers, dots, dashes and underscores, without spaces. It becomes the folder's name.</p>
          <Input id="np-name" autoFocus value={name} onChange={(e) => setName(e.target.value.trim())} placeholder="my-project" aria-invalid={!!name && !nameOk} autoComplete="off" spellCheck={false} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="np-folder" className="text-[14px] font-medium">
            Folder
          </label>
          <p className="text-[13px] text-muted-foreground">
            Directly inside {cfg.data?.projectRoots.join(" or ") ?? root}, so it shows up under Projects. You can add more project folders in{" "}
            <Link to="/preferences">App preferences</Link>.
          </p>
          <Input id="np-folder" value={shownFolder} onChange={(e) => setFolder(e.target.value)} spellCheck={false} autoComplete="off" className="font-mono text-[13px]" />
        </div>
        {create.error && (
          <p role="alert" className="text-[13.5px] text-danger">
            {create.error.message}
          </p>
        )}
        <div>
          <Button type="submit" disabled={!nameOk} busy={create.isPending}>
            Create project
          </Button>
        </div>
      </form>
    </Page>
  );
}
