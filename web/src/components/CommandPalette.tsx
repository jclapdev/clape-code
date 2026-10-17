import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, enc } from "@/lib/api";
import { useTheme } from "@/lib/prefs";
import { Kbd, useToast } from "./ui";

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

const itemClass =
  "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-[14px] text-ink data-[selected=true]:bg-accent-soft data-[selected=true]:text-accent-strong";

export function CommandPalette({ open, onClose, onToggleNav }: { open: boolean; onClose: () => void; onToggleNav: () => void }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 150);
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme();
  const toast = useToast();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setQ("");
      d.showModal();
    }
    if (!open && d.open) d.close();
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
      { label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme", run: () => (setTheme(theme === "dark" ? "light" : "dark"), onClose()) },
      { label: "Collapse or expand the menu", run: () => (onToggleNav(), onClose()) },
      { label: "Open preferences", run: () => go("/preferences") },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme],
  );
  const lower = q.toLowerCase().trim();
  const shownActions = actions.filter((a) => !lower || a.label.toLowerCase().includes(lower)).slice(0, lower ? 4 : 8);
  if (lower.length > 3) {
    shownActions.push({
      label: `Save “${q.trim()}” as feedback about this app`,
      run: () => {
        api.post("/feedback", { text: q.trim() }).then(() => toast({ tone: "ok", text: "Feedback saved. Read it under Preferences." }), (e) => toast({ tone: "danger", text: e.message }));
        onClose();
      },
    });
  }
  const hits = dq.length >= 2 ? (results.data ?? []) : [];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label="Search"
      className="mx-auto mt-[12vh] w-[calc(100%-32px)] max-w-[680px] overflow-hidden rounded-xl border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-black/40"
    >
      {open && (
        <Command shouldFilter={false} loop label="Search everything">
          <div className="flex items-center gap-2.5 border-b border-line px-4">
            <Search className="size-4 text-muted" aria-hidden />
            <Command.Input
              autoFocus
              value={q}
              onValueChange={setQ}
              placeholder="Search projects, sessions, skills, memory…"
              className="h-13 min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint"
            />
            <Kbd>esc</Kbd>
          </div>
          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-muted">{results.isFetching ? "Searching…" : "Nothing matches. Try a project, file or session name."}</Command.Empty>
            {shownActions.length > 0 && (
              <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted">
                {shownActions.map((a) => (
                  <Command.Item key={a.label} value={`action:${a.label}`} onSelect={a.run} className={itemClass}>
                    {a.label}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {hits.length > 0 && (
              <Command.Group heading="Results" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted">
                {hits.map((h) => (
                  <Command.Item key={h.kind + h.ref} value={`${h.kind}:${h.ref}`} onSelect={() => go(h.link)} className={itemClass}>
                    <span className="w-24 flex-none text-xs font-medium text-muted">{KIND_LABEL[h.kind] ?? h.kind}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{h.title}</span>
                      {h.snippet && <span className="block truncate text-xs text-muted">{h.snippet.replace(/\s+/g, " ")}</span>}
                    </span>
                    <span className="hidden max-w-[40%] truncate font-mono text-xs text-muted sm:block">{h.display}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
          <div className="flex flex-wrap gap-4 border-t border-line px-4 py-2 text-xs text-muted">
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
      )}
    </dialog>
  );
}
