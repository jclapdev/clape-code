import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, enc } from "@/lib/api";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command";
import { Kbd } from "./ui/kbd";

interface Hit {
  kind: string;
  ref: string;
  title: string;
  subtitle: string;
  snippet: string;
  link: string;
  display: string;
}

const KIND_LABEL: Record<string, string> = {
  session: "Session",
  project: "Project",
  doc: "File",
  skill: "Skill",
  agent: "Agent",
  command: "Command",
  rule: "Rule",
  "output-style": "Output style",
  hook: "Hook",
  "claude-md": "CLAUDE.md",
  plan: "Plan",
  memory: "Memory",
};

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function CommandPalette({ open, onClose, onToggleNav }: { open: boolean; onClose: () => void; onToggleNav: () => void }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 150);
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    if (open) setQ("");
  }, [open]);

  const results = useQuery({
    queryKey: ["search", dq],
    queryFn: () => api.get<Hit[]>(`/search?q=${enc(dq)}`),
    enabled: open && dq.length >= 2,
    placeholderData: (p) => p,
  });

  const go = (to: string) => {
    onClose();
    const [pathname, query = ""] = to.split("?");
    navigate({ to: pathname, search: Object.fromEntries(new URLSearchParams(query)) } as any);
  };

  const dark = resolvedTheme === "dark";
  const actions = useMemo(
    () => [
      { label: "Start a new session", run: () => go("/live?new=1") },
      { label: "Go to Home", run: () => go("/") },
      { label: "Go to Projects", run: () => go("/projects") },
      { label: "Go to Sessions", run: () => go("/sessions") },
      { label: "Go to Library", run: () => go("/library") },
      { label: "Go to Settings", run: () => go("/settings") },
      { label: "Go to Map", run: () => go("/map") },
      { label: "Go to Archive", run: () => go("/archive") },
      { label: "Show archived sessions", run: () => go("/sessions?archived=1") },
      { label: dark ? "Switch to light theme" : "Switch to dark theme", run: () => (setTheme(dark ? "light" : "dark"), onClose()) },
      { label: "Collapse or expand the menu", run: () => (onToggleNav(), onClose()) },
      { label: "Open preferences", run: () => go("/preferences") },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dark],
  );
  const lower = q.toLowerCase().trim();
  const shownActions = actions.filter((a) => !lower || a.label.toLowerCase().includes(lower)).slice(0, lower ? 4 : 8);
  if (lower.length > 3) {
    shownActions.push({
      label: `Save “${q.trim()}” as feedback about this app`,
      run: () => {
        api.post("/feedback", { text: q.trim() }).then(() => toast.success("Feedback added to FEEDBACK.md."), (e) => toast.error(e.message));
        onClose();
      },
    });
  }
  const hits = dq.length >= 2 ? (results.data ?? []) : [];

  return (
    <CommandDialog open={open} onOpenChange={(o) => !o && onClose()} title="Search" description="Search projects, sessions, config and memory, or run an action." className="sm:max-w-[680px]">
      <Command shouldFilter={false} loop>
        <CommandInput value={q} onValueChange={setQ} placeholder="Search projects, sessions, skills, memory…" />
        <CommandList className="max-h-[60vh]">
          <CommandEmpty>{results.isFetching ? "Searching…" : "Nothing matches. Try a project, file or session name."}</CommandEmpty>
          {shownActions.length > 0 && (
            <CommandGroup heading="Actions">
              {shownActions.map((a) => (
                <CommandItem key={a.label} value={`action:${a.label}`} onSelect={a.run}>
                  {a.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {hits.length > 0 && (
            <CommandGroup heading="Results">
              {hits.map((h) => (
                <CommandItem key={h.kind + h.ref} value={`${h.kind}:${h.ref}`} onSelect={() => go(h.link)}>
                  <span className="w-24 flex-none text-xs font-medium text-muted-foreground">{KIND_LABEL[h.kind] ?? h.kind}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{h.title}</span>
                    {h.snippet && <span className="block truncate text-xs text-muted-foreground">{h.snippet.replace(/\s+/g, " ")}</span>}
                  </span>
                  <span className="hidden max-w-[40%] truncate font-mono text-xs text-muted-foreground sm:block">{h.display}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
        <div className="flex flex-wrap gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> move
          </span>
          <span>
            <Kbd>↵</Kbd> open
          </span>
          <span>
            <Kbd>[</Kbd> <Kbd>]</Kbd> hide panes
          </span>
        </div>
      </Command>
    </CommandDialog>
  );
}
