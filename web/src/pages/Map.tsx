import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/lib/api";
import type { Access } from "@/lib/types";
import { Page } from "@/components/Panes";
import { AccessTag, ErrorNote, Loading, cn } from "@/components/ui";
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

const FILTERS: { id: "all" | Access; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "edit", label: "Editable" },
  { id: "app", label: "Claude Code owns" },
  { id: "secret", label: "Secret" },
];

export function MapPage() {
  const q = useQuery({ queryKey: ["map"], queryFn: () => api.get<{ name: string; entries: MapEntry[] }[]>("/map") });
  const [f, setF] = useState<"all" | Access>("all");
  const [hideMissing, setHideMissing] = useState(true);
  const navigate = useNavigate();
  const open = (link: string) => {
    const [pathname, query = ""] = link.split("?");
    navigate({ to: pathname, search: Object.fromEntries(new URLSearchParams(query)) } as any);
  };
  return (
    <Page title="Map" sub="Every file and folder Claude Code uses on this machine: what it is, its format, and whether you can edit it." wide>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ToggleGroup type="single" variant="outline" size="sm" value={f} onValueChange={(v) => v && setF(v as typeof f)} aria-label="Filter by access" className="flex-wrap">
          {FILTERS.map((x) => (
            <ToggleGroupItem key={x.id} value={x.id} className="data-[state=on]:bg-foreground data-[state=on]:text-background">
              {x.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <label className="ml-auto flex items-center gap-2 text-[13px] text-muted-foreground">
          <Checkbox checked={hideMissing} onCheckedChange={(v) => setHideMissing(v === true)} /> Hide what doesn't exist yet
        </label>
      </div>
      {q.isLoading && <Loading />}
      <ErrorNote error={q.error} />
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
          {(q.data ?? []).map((g) => {
            const rows = g.entries.filter((e) => (f === "all" || e.access === f) && (!hideMissing || e.exists || e.access === "secret"));
            if (!rows.length) return null;
            return (
              <tbody key={g.name}>
                <tr>
                  <th colSpan={5} className="border-t border-line bg-sunken/60 px-4 py-2.5 text-[13px] font-semibold">
                    {g.name}
                  </th>
                </tr>
                {rows.map((e) => (
                  <tr key={e.path} onClick={() => e.link && open(e.link)} className={cn("border-t border-line", e.link && "cursor-pointer hover:bg-sunken/50", !e.exists && "opacity-55")}>
                    <td className="px-4 py-2.5 font-mono text-[12.5px]">
                      {e.link ? (
                        <a href={e.link} onClick={(ev) => (ev.preventDefault(), open(e.link!))} className="text-ink no-underline hover:text-primary">
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
            );
          })}
        </table>
      </div>
      <p className="mt-4 text-[13px] text-muted-foreground">Secret items are listed so you know they exist; the app never opens them or sends their contents to the browser.</p>
    </Page>
  );
}
