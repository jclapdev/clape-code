import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, Folder } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import type { Access } from "@/lib/types";
import { Page } from "@/components/Panes";
import { AccessTag, ErrorNote, Loading, Tag, cn } from "@/components/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface MapEntry {
  path: string;
  what: string;
  format: string;
  count: number | null;
  access: Access;
  link: string | null;
  exists: boolean;
}
interface MapGroup {
  name: string;
  entries: MapEntry[];
}
interface Precedence {
  source: string;
  label: string;
  path: string;
  note: string;
  exists: boolean;
}

const FILTERS: { id: "all" | Access; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "edit", label: "Editable" },
  { id: "app", label: "Claude Code owns" },
  { id: "secret", label: "Secret" },
];

function PrecedenceStrip({ items }: { items: Precedence[] }) {
  return (
    <section aria-label="Which settings file wins" className="mb-5 flex flex-col gap-2">
      <p className="text-[13px] text-muted-foreground">When two settings files set the same thing, the one further left wins. Lists such as permission rules are combined.</p>
      <ol className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {items.map((p, i) => (
          <li key={p.source} className={cn("flex flex-col gap-1 rounded-lg border bg-surface px-3.5 py-3", !p.exists && "border-dashed opacity-60")}>
            <span className="flex items-center justify-between gap-2">
              <span className="font-semibold">
                {i + 1}. {p.label}
              </span>
              {!p.exists && <span className="text-xs text-muted-foreground">not on this machine</span>}
            </span>
            <span className="break-all font-mono text-[11.5px] text-muted-foreground">{p.path}</span>
            <span className="text-xs text-ink-2">{p.note}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TableView({ groups, open }: { groups: MapGroup[]; open: (link: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[860px] border-collapse text-left">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="px-4 py-2.5 font-normal">Where</th>
            <th className="px-4 py-2.5 font-normal">What it is</th>
            <th className="px-4 py-2.5 font-normal">Format</th>
            <th className="px-4 py-2.5 text-right font-normal">Items</th>
            <th className="px-4 py-2.5 font-normal">Access</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.name}>
            <tr>
              <th colSpan={5} className="border-t border-line bg-sunken/60 px-4 py-2.5 text-[13px] font-semibold">
                {g.name}
              </th>
            </tr>
            {g.entries.map((e) => (
              <tr key={e.path} onClick={() => e.link && open(e.link)} className={cn("border-t border-line", e.link && "cursor-pointer hover:bg-sunken/50", !e.exists && "opacity-55")}>
                <td className="px-4 py-2.5 font-mono text-[12.5px]">
                  {e.link ? (
                    <a href={e.link} onClick={(ev) => (ev.preventDefault(), ev.stopPropagation(), open(e.link!))} className="text-ink no-underline hover:text-primary">
                      {e.path}
                    </a>
                  ) : (
                    e.path
                  )}
                </td>
                <td className="px-4 py-2.5 text-[13.5px] text-ink-2">{e.what}</td>
                <td className="px-4 py-2.5 text-[12.5px] text-muted-foreground">{e.format}</td>
                <td className="px-4 py-2.5 text-right font-mono text-[12.5px] text-muted-foreground">{e.count ?? ""}</td>
                <td className="px-4 py-2.5">
                  <AccessTag access={e.access} />
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

// ---- Tree (preview) ----

interface Node {
  name: string;
  children: Map<string, Node>;
  entry?: MapEntry;
}

/** The group's base folder, e.g. "~/.claude" from "Global · ~/.claude"; entries are shown relative to it. */
const baseOf = (g: MapGroup) => (g.name.includes(" · ") ? g.name.split(" · ")[1] : "");

function buildTree(g: MapGroup): Node {
  const root: Node = { name: baseOf(g) || g.name, children: new Map() };
  const base = baseOf(g);
  for (const e of g.entries) {
    const rel = base && e.path.startsWith(base + "/") ? e.path.slice(base.length + 1) : e.path;
    const parts = rel.split("/").filter(Boolean);
    let n = root;
    parts.forEach((part, i) => {
      if (!n.children.has(part)) n.children.set(part, { name: part, children: new Map() });
      n = n.children.get(part)!;
      if (i === parts.length - 1) n.entry = e;
    });
  }
  return root;
}

function TreeNode({ node, depth, open }: { node: Node; depth: number; open: (link: string) => void }) {
  const kids = [...node.children.values()];
  const e = node.entry;
  const row = (
    <div className={cn("flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pr-3", e && !e.exists && "opacity-55")} style={{ paddingLeft: depth * 18 + 8 }}>
      {kids.length ? <ChevronRight className="size-3.5 flex-none text-muted-foreground transition-transform group-open/node:rotate-90" aria-hidden /> : <span className="w-3.5 flex-none" />}
      {kids.length > 0 && !e && <Folder className="size-3.5 flex-none text-muted-foreground" aria-hidden />}
      {e?.link ? (
        <a href={e.link} onClick={(ev) => (ev.preventDefault(), open(e.link!))} className="font-mono text-[12.5px] text-ink no-underline hover:text-primary">
          {node.name}
        </a>
      ) : (
        <span className="font-mono text-[12.5px]">{node.name}</span>
      )}
      {e && <span className="min-w-0 flex-1 text-[13px] text-ink-2">{e.what}</span>}
      {e?.count != null && <span className="font-mono text-xs text-muted-foreground">{e.count}</span>}
      {e && <AccessTag access={e.access} />}
    </div>
  );
  if (!kids.length) return <li className="border-t border-line">{row}</li>;
  return (
    <li className="border-t border-line">
      <details open className="group/node">
        <summary className="cursor-pointer list-none hover:bg-sunken/50">{row}</summary>
        <ul>
          {kids.map((k) => (
            <TreeNode key={k.name} node={k} depth={depth + 1} open={open} />
          ))}
        </ul>
      </details>
    </li>
  );
}

function TreeView({ groups, open }: { groups: MapGroup[]; open: (link: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-muted-foreground">
        <Tag tone="attn">Preview</Tag> The same entries as a folder tree. Pick whichever view you prefer and the other will be removed.
      </p>
      {groups.map((g) => (
        <section key={g.name} className="overflow-hidden rounded-lg border border-line bg-surface">
          <h2 className="bg-sunken/60 px-4 py-2.5 text-[13px] font-semibold">{g.name}</h2>
          <ul className="[&>li:first-child]:border-t-0">
            {[...buildTree(g).children.values()].map((n) => (
              <TreeNode key={n.name} node={n} depth={0} open={open} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function MapPage() {
  const q = useQuery({ queryKey: ["map"], queryFn: () => api.get<{ groups: MapGroup[]; precedence: Precedence[] }>("/map") });
  const [f, setF] = useState<"all" | Access>("all");
  const [hideMissing, setHideMissing] = useState(true);
  const [view, setView] = useState<"table" | "tree">("table");
  const navigate = useNavigate();
  // Entries point at where each thing is shown: its Customize page, filtered to the project, or Settings.
  const SECTION: Record<string, string> = { skill: "skills", agent: "agents", command: "skills", rule: "instructions", "output-style": "output-styles", hook: "hooks", plan: "plans", "claude-md": "instructions", memory: "memory" };
  const open = (link: string) => {
    const [pathname, query = ""] = link.split("?");
    const params = Object.fromEntries(new URLSearchParams(query));
    if (pathname === "/settings") {
      navigate({ to: "/settings", search: params.scope && params.scope !== "global" ? { project: params.scope } : {} });
      return;
    }
    if (pathname === "/library") {
      const feature = SECTION[params.kind ?? ""];
      if (feature) navigate({ to: `/${feature}` as "/skills", search: params.scope && params.scope !== "global" ? { project: params.scope } : {} });
      else navigate({ to: "/customize" });
      return;
    }
    navigate({ to: pathname, search: params } as any);
  };
  const groups = (q.data?.groups ?? [])
    .map((g) => ({ ...g, entries: g.entries.filter((e) => (f === "all" || e.access === f) && (!hideMissing || e.exists || e.access === "secret")) }))
    .filter((g) => g.entries.length);

  return (
    <Page title="File locations" sub="Each file and folder Claude Code reads on this computer: what it is, its format, and whether you can change it here." wide>
      {q.data && <PrecedenceStrip items={q.data.precedence} />}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ToggleGroup type="single" variant="outline" size="sm" value={f} onValueChange={(v) => v && setF(v as typeof f)} aria-label="Filter by access" className="flex-wrap">
          {FILTERS.map((x) => (
            <ToggleGroupItem key={x.id} value={x.id} className="data-[state=on]:bg-foreground data-[state=on]:text-background">
              {x.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Checkbox checked={hideMissing} onCheckedChange={(v) => setHideMissing(v === true)} /> Hide what doesn't exist yet
        </label>
        <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && setView(v as typeof view)} aria-label="View" className="ml-auto">
          <ToggleGroupItem value="table">Table</ToggleGroupItem>
          <ToggleGroupItem value="tree">Tree (preview)</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {q.isLoading && <Loading />}
      <ErrorNote error={q.error} />
      {view === "table" ? <TableView groups={groups} open={open} /> : <TreeView groups={groups} open={open} />}
      <p className="mt-4 text-[13px] text-muted-foreground">Secret items are listed so you know they exist; the app never opens them or sends their contents to the browser.</p>
    </Page>
  );
}
