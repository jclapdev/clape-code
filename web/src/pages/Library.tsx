import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Archive, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api, enc } from "@/lib/api";
import { when } from "@/lib/format";
import type { Kind, LibraryItem, Project } from "@/lib/types";
import { FileEditor } from "@/components/FileEditor";
import { DetailHeader, TwoPane } from "@/components/Panes";
import { EmptyState, ErrorNote, Loading, Tag, cn, useConfirm } from "@/components/ui";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SimpleSelect } from "@/components/SimpleSelect";

export const KIND_LABEL: Record<Kind, [string, string]> = {
  skill: ["Skill", "Skills"],
  agent: ["Agent", "Agents"],
  command: ["Command", "Commands"],
  rule: ["Rule", "Rules"],
  "output-style": ["Output style", "Output styles"],
  hook: ["Hook script", "Hook scripts"],
  "claude-md": ["CLAUDE.md", "CLAUDE.md files"],
  plan: ["Plan", "Plans"],
  memory: ["Memory note", "Memory"],
  plugin: ["Plugin", "Plugins"],
};
const KIND_ORDER: Kind[] = ["skill", "agent", "command", "rule", "output-style", "hook", "claude-md", "plan", "memory", "plugin"];
const ARCHIVABLE: Kind[] = ["skill", "agent", "command", "rule", "output-style", "plan", "memory"];

function sourceTag(i: LibraryItem) {
  if (i.source === "plugin") return <Tag>{i.kind === "plugin" ? i.sourceName : `plugin ${i.sourceName}`}</Tag>;
  if (i.source === "synced") return <Tag>claude.ai</Tag>;
  if (i.kind === "memory") return <Tag className="max-w-40 truncate">{String(i.sourceName).replace(/^-Users-[^-]+-/, "")}</Tag>;
  return null;
}

function stateTag(i: LibraryItem) {
  if (i.state === "off") return <Tag tone="danger">Off</Tag>;
  if (i.state === "name-only") return <Tag>Name only</Tag>;
  if (i.state === "user-invocable-only") return <Tag>Hidden from Claude</Tag>;
  return null;
}

const libKey = (scope: string) => ["library", scope];
const useLibrary = (scope: string) =>
  useQuery({ queryKey: libKey(scope), queryFn: () => api.get<{ items: LibraryItem[] }>(`/library?scope=${enc(scope)}`) });

/** Compact list used inside a project's Config tab. */
export function LibraryList({ items, scope, emptyText }: { items: LibraryItem[]; scope: string; emptyText: string }) {
  if (!items.length) return <EmptyState title="Nothing here yet">{emptyText}</EmptyState>;
  const kinds = KIND_ORDER.filter((k) => items.some((i) => i.kind === k));
  return (
    <div className="flex flex-col gap-4">
      {kinds.map((k) => (
        <section key={k}>
          <h3 className="px-3 pb-1 text-xs font-medium text-muted-foreground">{KIND_LABEL[k][1]}</h3>
          {items
            .filter((i) => i.kind === k)
            .map((i) => (
              <Link key={i.path} to="/library" search={{ scope, path: i.path, kind: k }} className="flex items-center gap-3 rounded-md px-3 py-2 text-ink no-underline hover:bg-sunken">
                <span className="w-48 flex-none truncate font-medium">{i.name}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{i.description}</span>
                {stateTag(i)}
              </Link>
            ))}
        </section>
      ))}
    </div>
  );
}

function NewItemDialog({ open, onClose, scope, kind }: { open: boolean; onClose: () => void; scope: string; kind: Kind }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const valid = /^[a-z0-9][a-z0-9-]{0,63}$/.test(name);
  const base = scope === "global" ? "~/.claude" : `${scope}/.claude`;
  const path =
    kind === "skill" ? `${base}/skills/${name}/SKILL.md` : kind === "agent" ? `${base}/agents/${name}.md` : kind === "rule" ? `${base}/rules/${name}.md` : `${base}/commands/${name}.md`;
  const body =
    kind === "skill"
      ? `---\nname: ${name}\ndescription: ${description || "Use this skill when …"}\n---\n\n# ${name}\n\n`
      : kind === "agent"
        ? `---\nname: ${name}\ndescription: ${description || "Use this agent when …"}\ntools: Read, Grep, Glob\n---\n\nYou are …\n`
        : kind === "rule"
          ? `---\npaths:\n  - "**/*"\n---\n\n${description}\n`
          : `---\ndescription: ${description || name}\n---\n\n`;
  const create = useMutation({
    mutationFn: () => api.put("/file", { path, content: body, hash: null }),
    onSuccess: () => {
      onClose();
      setName("");
      setDescription("");
      qc.invalidateQueries({ queryKey: ["library"] });
      navigate({ to: "/library", search: { scope, kind, path } });
      toast.success(`Created ${KIND_LABEL[kind][0].toLowerCase()} ${name}.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`New ${KIND_LABEL[kind][0].toLowerCase()}`}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-ink-2">Name</span>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="lowercase-with-dashes" className="font-mono" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-ink-2">{kind === "rule" ? "What the rule says" : "When Claude should use it"}</span>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <p className="font-mono text-xs text-muted-foreground">{valid ? path : "Use lowercase letters, numbers and dashes."}</p>
        </div>
        <DialogFooter>
          <Button size="lg" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" disabled={!valid} busy={create.isPending} onClick={() => create.mutate()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemDetail({ item, scope }: { item: LibraryItem; scope: string }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [validation, setValidation] = useState<{ ok: boolean; output: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["library"] });
  const memory = useQuery({
    queryKey: ["memory", "check"],
    queryFn: () => api.get<{ folder: string; missingFromIndex: string[]; deadLinks: string[] }[]>("/memory/check"),
    enabled: item.kind === "memory",
  });
  const memIssue = item.kind === "memory" ? memory.data?.find((m) => m.folder === item.sourceName && (m.missingFromIndex.length || m.deadLinks.length)) : undefined;

  const act = useMutation({
    mutationFn: async (op: "archive" | "delete" | "validate" | "sync") => {
      if (op === "archive") return api.post("/library/archive", { path: item.path, kind: item.kind });
      if (op === "delete") return api.post("/library/delete", { path: item.path, kind: item.kind });
      if (op === "sync") return api.post("/memory/sync", { folder: item.sourceName });
      return api.post<{ available: boolean; ok: boolean; output: string }>("/library/validate", { path: item.path });
    },
    onSuccess: (r: any, op) => {
      if (op === "validate") return setValidation(r);
      if (op === "sync") {
        toast.success(`Index updated: ${r.added} added, ${r.removed} removed.`);
        return qc.invalidateQueries({ queryKey: ["memory"] });
      }
      refresh();
      navigate({ to: "/library", search: { scope, kind: item.kind } });
      if (op === "archive") toast.success(`Archived ${item.name}.`, { action: { label: "Open archive", onClick: () => navigate({ to: "/archive" }) } });
      else toast.success(`Moved ${item.name} to the trash.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setState = useMutation({
    mutationFn: (state: string) =>
      item.kind === "plugin" ? api.post("/library/plugin", { key: item.overrideKey, enabled: state === "on" }) : api.post("/library/skill-state", { key: item.overrideKey, state, scope }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  const editable = item.access === "edit";
  const canArchive = editable && ARCHIVABLE.includes(item.kind);

  return (
    <FileEditor
      path={item.path}
      header={
        <DetailHeader
          title={item.name}
          sub={
            <span className="flex flex-wrap items-center gap-2">
              <span>{KIND_LABEL[item.kind][0]}</span>
              {sourceTag(item)}
              {item.mtime && <span>changed {when(item.mtime)}</span>}
              {item.error && <Tag tone="danger">{item.error}</Tag>}
            </span>
          }
          actions={
            <>
              {item.kind === "skill" && editable && (
                <Button variant="outline" busy={act.isPending && act.variables === "validate"} onClick={() => act.mutate("validate")}>
                  <ShieldCheck className="size-3.5" aria-hidden /> Validate
                </Button>
              )}
              {canArchive && (
                <Button variant="outline"
                 
                  onClick={async () => {
                    if (await confirm({ title: `Archive ${item.name}?`, body: "Claude Code stops loading it. You can restore it from Archive at any time.", confirm: "Archive" })) act.mutate("archive");
                  }}
                >
                  <Archive className="size-3.5" aria-hidden /> Archive
                </Button>
              )}
              {editable && item.kind !== "claude-md" && (
                <Button
                 
                  variant="destructive"
                  onClick={async () => {
                    if (await confirm({ title: `Delete ${item.name}?`, body: "It moves to your computer's trash, where you can still recover it.", confirm: "Move to trash", danger: true })) act.mutate("delete");
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden /> Delete
                </Button>
              )}
            </>
          }
        >
          {item.description && (
            <details className="group max-w-[80ch] text-[13.5px] text-ink-2">
              <summary className="cursor-pointer list-none line-clamp-2 group-open:line-clamp-none">{item.description}</summary>
            </details>
          )}
          {item.overrideKey && item.kind === "skill" && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[13px] text-muted-foreground">Who can use it</span>
              <ToggleGroup type="single" variant="outline" size="sm" value={item.state ?? "on"} onValueChange={(v) => v && setState.mutate(v)} aria-label="Skill visibility">
                <ToggleGroupItem value="on" title="Claude sees it and you can type /name">
                  On
                </ToggleGroupItem>
                <ToggleGroupItem value="name-only" title="Claude sees only its name">
                  Name only
                </ToggleGroupItem>
                <ToggleGroupItem value="user-invocable-only" title="Claude doesn't see it; you can still type /name">
                  Only me
                </ToggleGroupItem>
                <ToggleGroupItem value="off" title="Hidden from Claude and from / autocomplete">
                  Off
                </ToggleGroupItem>
              </ToggleGroup>
              <span className="text-xs text-muted-foreground">Saved to {scope === "global" ? "~/.claude/settings.json" : ".claude/settings.local.json"}</span>
            </div>
          )}
          {item.kind === "plugin" && (
            <div className="flex items-center gap-3">
              <ToggleGroup type="single" variant="outline" size="sm" value={item.state ?? "off"} onValueChange={(v) => v && setState.mutate(v)} aria-label="Plugin">
                <ToggleGroupItem value="on">Enabled</ToggleGroupItem>
                <ToggleGroupItem value="off">Disabled</ToggleGroupItem>
              </ToggleGroup>
              {item.meta.version && <span className="text-xs text-muted-foreground">Version {String(item.meta.version)}</span>}
            </div>
          )}
          {item.source === "plugin" && item.kind !== "plugin" && <p className="text-[13px] text-muted-foreground">Part of the {item.sourceName} plugin. Turn the whole plugin on or off under Plugins.</p>}
          {memIssue && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-attn-line bg-attn-soft px-3 py-2 text-[13px] text-attn">
              <span>
                MEMORY.md is out of step: {memIssue.missingFromIndex.length} notes missing from it, {memIssue.deadLinks.length} links to notes that no longer exist.
              </span>
              <Button variant="attn" onClick={() => act.mutate("sync")}>
                Rebuild index
              </Button>
            </div>
          )}
          {validation && (
            <pre className={cn("max-h-40 overflow-auto whitespace-pre-wrap rounded-md border px-3 py-2 font-mono text-xs", validation.ok ? "border-ok-dot/40 bg-ok-soft text-ok" : "border-danger-line bg-danger-soft text-danger")}>
              {validation.ok ? "Valid. " : ""}
              {validation.output}
            </pre>
          )}
        </DetailHeader>
      }
    />
  );
}

export function LibraryPage() {
  const s = useSearch({ strict: false }) as { kind?: string; scope?: string; path?: string };
  const scope = s.scope ?? "global";
  const navigate = useNavigate();
  const lib = useLibrary(scope);
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/projects") });
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const kind = (s.kind as Kind | undefined) ?? null;

  const items = lib.data?.items ?? [];
  const counts = useMemo(() => {
    const c: Partial<Record<Kind, number>> = {};
    for (const i of items) c[i.kind] = (c[i.kind] ?? 0) + 1;
    return c;
  }, [items]);
  const f = filter.toLowerCase();
  const shown = items.filter((i) => (!kind || i.kind === kind) && (!f || i.name.toLowerCase().includes(f) || i.description.toLowerCase().includes(f)));
  const selected = s.path ? items.find((i) => i.path === s.path) : undefined;
  const creatable = (["skill", "agent", "command", "rule"] as Kind[]).includes(kind ?? "skill") ? (kind ?? "skill") : null;

  const list = (
    <div className="flex flex-col pb-6">
      <div className="sticky top-0 z-10 flex flex-col gap-2 bg-panel px-4 pb-2 pt-4">
        <div className="flex gap-2">
          <SimpleSelect
            label="Scope"
            value={scope}
            onChange={(v) => navigate({ to: "/library", search: { scope: v, kind: kind ?? undefined } })}
            className="min-w-0 flex-1"
            options={[
              { value: "global", label: "Global (all projects)" },
              ...(projects.data ?? []).filter((p) => p.hasClaudeDir || p.docs.includes("CLAUDE.md")).map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          {creatable && (
            <Button variant="outline" onClick={() => setCreating(true)} aria-label={`New ${KIND_LABEL[creatable][0].toLowerCase()}`}>
              <Plus aria-hidden /> New
            </Button>
          )}
        </div>
        <ToggleGroup
          type="single"
          size="sm"
          spacing={1}
          value={kind ?? "all"}
          onValueChange={(v) => v && navigate({ to: "/library", search: { scope, kind: v === "all" ? undefined : v } })}
          aria-label="Item type"
          className="flex-wrap"
        >
          <ToggleGroupItem value="all" className="rounded-full data-[state=on]:bg-foreground data-[state=on]:text-background">
            All
          </ToggleGroupItem>
          {KIND_ORDER.filter((k) => counts[k]).map((k) => (
            <ToggleGroupItem key={k} value={k} className="rounded-full data-[state=on]:bg-foreground data-[state=on]:text-background">
              {KIND_LABEL[k][1]} <span className="opacity-70">{counts[k]}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <label htmlFor="lf" className="sr-only">
          Filter
        </label>
        <Input id="lf" data-filter value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter  /" />
      </div>
      {lib.isLoading && <Loading />}
      <ErrorNote error={lib.error} />
      <ul className="px-2">
        {shown.map((i) => (
          <li key={i.path}>
            <Link
              to="/library"
              search={{ scope, kind: kind ?? undefined, path: i.path }}
              className={cn("flex flex-col gap-0.5 rounded-md px-2.5 py-2 text-ink no-underline hover:bg-sunken", selected?.path === i.path && "bg-surface shadow-[0_0_0_1px_var(--line-strong)]", i.state === "off" && "opacity-70")}
            >
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{i.name}</span>
                {stateTag(i)}
                {sourceTag(i)}
              </span>
              {i.description && <span className="line-clamp-1 text-[12.5px] text-muted-foreground">{i.description}</span>}
            </Link>
          </li>
        ))}
      </ul>
      {!lib.isLoading && !shown.length && <p className="px-5 py-4 text-muted-foreground">Nothing matches.</p>}
    </div>
  );

  return (
    <>
      <TwoPane
        id="library"
        listLabel="Library"
        hasSelection={!!selected}
        onBack={() => navigate({ to: "/library", search: { scope, kind: kind ?? undefined } })}
        list={list}
        detail={
          selected ? (
            <ItemDetail item={selected} scope={scope} />
          ) : (
            <EmptyState title={kind ? KIND_LABEL[kind][1] : "Library"}>Pick an item to read or edit it. Items you own can be archived, deleted or turned off.</EmptyState>
          )
        }
      />
      {creatable && <NewItemDialog open={creating} onClose={() => setCreating(false)} scope={scope} kind={creatable} />}
    </>
  );
}
