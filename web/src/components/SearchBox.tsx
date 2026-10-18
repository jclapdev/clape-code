// The search box at the top of the menu: sessions by what was said, plus plans, skills, agents and documents.
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { Input } from "./ui/input";
import { cn } from "./ui";

interface Hit {
  kind: string;
  title: string;
  subtitle: string;
  snippet: string;
  link: string;
}

const KIND: Record<string, string> = {
  project: "Projects",
  session: "Sessions",
  plan: "Plans",
  skill: "Skills",
  agent: "Agents",
  command: "Commands",
  rule: "Rules",
  "output-style": "Output styles",
  memory: "Memory",
  "claude-md": "Instructions",
  settings: "Settings",
  "hook-def": "Hooks",
  hook: "Hooks",
  doc: "Documents",
  plugin: "Plugins",
};

/** The index marks matches as [word]; show them in bold. */
function Snippet({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  // Markdown symbols in the matched text are dropped so the snippet reads as plain words.
  text = text.replace(/(^|\s)#{1,6}\s/g, "$1").replace(/[`*_]{1,3}/g, "").replace(/\]\([^)]*\)/g, "]");
  text.split(/(\[[^\]]+\])/).forEach((p, i) => parts.push(/^\[.*\]$/.test(p) ? <b key={i}>{p.slice(1, -1)}</b> : p));
  return <>{parts}</>;
}

export function SearchBox({ onPick }: { onPick?: () => void }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  // The menu clips anything wider than itself, so results float at a fixed spot under the box.
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (!open || !box.current) return;
    const place = () => {
      const b = box.current!.getBoundingClientRect();
      setAt({ left: b.left, top: b.bottom + 4 });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);
  const r = useQuery({ queryKey: ["search", debounced], queryFn: () => api.get<Hit[]>(`/search?q=${encodeURIComponent(debounced)}`), enabled: debounced.length >= 2 });
  const hits = r.data ?? [];
  const go = (h: Hit) => {
    const [path, rest = ""] = h.link.split("#");
    const [pathname, query = ""] = path!.split("?");
    navigate({ to: pathname, search: Object.fromEntries(new URLSearchParams(query)), hash: rest || undefined } as any);
    setOpen(false);
    setQ("");
    onPick?.();
  };
  const groups = new Map<string, Hit[]>();
  for (const h of hits) groups.set(KIND[h.kind] ?? h.kind, [...(groups.get(KIND[h.kind] ?? h.kind) ?? []), h]);
  const flat = [...groups.values()].flat();

  return (
    <div ref={box} className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (flat.length ? (i + (e.key === "ArrowDown" ? 1 : flat.length - 1)) % flat.length : 0));
          } else if (e.key === "Enter" && flat[active]) go(flat[active]!);
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search everything"
        aria-label="Search"
        className="pl-8"
      />
      {open && debounced.length >= 2 && (
        <div role="listbox" aria-label="Search results" style={at ?? undefined} className="fixed z-50 max-h-[70vh] w-[min(560px,85vw)] overflow-auto rounded-lg border border-line bg-popover p-1 shadow-[var(--shadow)]">
          {r.isFetching && !hits.length ? (
            <p className="px-3 py-2 text-[13px] text-muted-foreground">Searching…</p>
          ) : r.isError ? (
            <p className="px-3 py-2 text-[13px] text-danger">Search failed. Try again.</p>
          ) : !hits.length ? (
            <p className="px-3 py-2 text-[13px] text-muted-foreground">Nothing matches "{debounced}".</p>
          ) : (
            [...groups].map(([label, list]) => (
              <div key={label} className="py-1">
                <div className="px-3 pb-1 pt-1.5 text-[12px] font-medium text-muted-foreground">{label}</div>
                {list.map((h) => {
                  const i = flat.indexOf(h);
                  return (
                    <button
                      key={h.link + h.title}
                      type="button"
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(h)}
                      className={cn("flex w-full flex-col rounded-md px-3 py-2 text-left", i === active && "bg-accent text-accent-foreground")}
                    >
                      <span className="truncate text-[14px] font-medium">{h.title}</span>
                      {h.snippet && (
                        <span className="line-clamp-2 text-[12.5px] text-muted-foreground">
                          <Snippet text={h.snippet} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
