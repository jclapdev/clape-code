import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Archive, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api, enc } from "@/lib/api";
import { when } from "@/lib/format";
import type { Kind, LibraryItem, Project } from "@/lib/types";
import { FileEditor } from "@/components/FileEditor";
import { DetailHeader, TwoPane } from "@/components/Panes";
import { Button, cn, Dialog, Empty, ErrorNote, Segmented, Spinner, Tag, useConfirm, useToast } from "@/components/ui";

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
  if (!items.length) return <Empty title="Nothing here yet">{emptyText}</Empty>;
  const kinds = KIND_ORDER.filter((k) => items.some((i) => i.kind === k));
  return (
    <div className="flex flex-col gap-4">
      {kinds.map((k) => (
        <section key={k}>
          <h3 className="px-3 pb-1 text-xs font-medium text-muted">{KIND_LABEL[k][1]}</h3>
          {items
            .filter((i) => i.kind === k)
            .map((i) => (
              <Link key={i.path} to="/library" search={{ scope, path: i.path, kind: k }} className="flex items-center gap-3 rounded-md px-3 py-2 text-ink no-underline hover:bg-sunken">
                <span className="w-48 flex-none truncate font-medium">{i.name}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{i.description}</span>
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
  const toast = useToast();
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
      toast({ tone: "ok", text: `Created ${KIND_LABEL[kind][0].toLowerCase()} ${name}.` });
    },
    onError: (e: Error) => toast({ tone: "danger", text: e.message }),
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`New ${KIND_LABEL[kind][0].toLowerCase()}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid} busy={create.isPending} onClick={() => create.mutate()}>
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[13px] text-ink-2">Name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="lowercase-with-dashes" className="h-9 rounded-md border border-line-strong bg-surface px-3 font-mono outline-none focus:border-accent" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[13px] text-ink-2">{kind === "rule" ? "What the rule says" : "When Claude should use it"}</span>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-md border border-line-strong bg-surface p-2.5 outline-none focus:border-accent" />
        </label>
        <p className="font-mono text-xs text-muted">{valid ? path : "Use lowercase letters, numbers and dashes."}</p>
      </div>
    </Dialog>
  );
}

function ItemDetail({ item, scope }: { item: LibraryItem; scope: string }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
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
        toast({ tone: "ok", text: `Index updated: ${r.added} added, ${r.removed} removed.` });
        return qc.invalidateQueries({ queryKey: ["memory"] });
      }
      refresh();
      navigate({ to: "/library", search: { scope, kind: item.kind } });
      toast({
        tone: "ok",
        text: op === "archive" ? `Archived ${item.name}.` : `Moved ${item.name} to the trash.`,
        action: op === "archive" ? { label: "Open archive", run: () => navigate({ to: "/archive" }) } : undefined,
      });
    },
    onError: (e: Error) => toast({ tone: "danger", text: e.message }),
  });

  const setState = useMutation({
    mutationFn: (state: string) =>
      item.kind === "plugin" ? api.post("/library/plugin", { key: item.overrideKey, enabled: state === "on" }) : api.post("/library/skill-state", { key: item.overrideKey, state, scope }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast({ tone: "danger", text: e.message }),
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
                <Button size="sm" busy={act.isPending && act.variables === "validate"} onClick={() => act.mutate("validate")}>
                  <ShieldCheck className="size-3.5" aria-hidden /> Validate
                </Button>
              )}
              {canArchive && (
                <Button
                  size="sm"
                  onClick={async () => {
                    if (await confirm({ title: `Archive ${item.name}?`, body: "Claude Code stops loading it. You can restore it from Archive at any time.", confirm: "Archive" })) act.mutate("archive");
                  }}
                >
                  <Archive className="size-3.5" aria-hidden /> Archive
                </Button>
              )}
              {editable && item.kind !== "claude-md" && (
                <Button
                  size="sm"
                  variant="danger"
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
              <span className="text-[13px] text-muted">Who can use it</span>
              <Segmented
                label="Skill visibility"
                value={item.state ?? "on"}
                onChange={(v) => setState.mutate(v)}
                options={[
                  { value: "on", label: "On", title: "Claude sees it and you can type /name" },
                  { value: "name-only", label: "Name only", title: "Claude sees only its name" },
                  { value: "user-invocable-only", label: "Only me", title: "Claude doesn't see it; you can still type /name" },
                  { value: "off", label: "Off", title: "Hidden from Claude and from / autocomplete" },
                ]}
              />
              <span className="text-xs text-muted">Saved to {scope === "global" ? "~/.claude/settings.json" : ".claude/settings.local.json"}</span>
            </div>
          )}
          {item.kind === "plugin" && (
            <div className="flex items-center gap-3">
              <Segmented label="Plugin" value={item.state ?? "off"} onChange={(v) => setState.mutate(v)} options={[{ value: "on", label: "Enabled" }, { value: "off", label: "Disabled" }]} />
              {item.meta.version && <span className="text-xs text-muted">Version {String(item.meta.version)}</span>}
            </div>
          )}
          {item.source === "plugin" && item.kind !== "plugin" && <p className="text-[13px] text-muted">Part of the {item.sourceName} plugin. Turn the whole plugin on or off under Plugins.</p>}
          {memIssue && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-attn-line bg-attn-soft px-3 py-2 text-[13px] text-attn">
              <span>
                MEMORY.md is out of step: {memIssue.missingFromIndex.length} notes missing from it, {memIssue.deadLinks.length} links to notes that no longer exist.
              </span>
              <Button size="sm" variant="attn" onClick={() => act.mutate("sync")}>
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
          <label htmlFor="scope" className="sr-only">
            Scope
          </label>
          <select
            id="scope"
            value={scope}
            onChange={(e) => navigate({ to: "/library", search: { scope: e.target.value, kind: kind ?? undefined } })}
            className="h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2 text-[13.5px]"
          >
            <option value="global">Global (all projects)</option>
            {(projects.data ?? [])
              .filter((p) => p.hasClaudeDir || p.docs.includes("CLAUDE.md"))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          {creatable && (
            <Button size="sm" className="h-9" onClick={() => setCreating(true)} aria-label={`New ${KIND_LABEL[creatable][0].toLowerCase()}`}>
              <Plus className="size-4" aria-hidden /> New
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => navigate({ to: "/library", search: { scope } })} className={cn("h-7 rounded-full px-2.5 text-[12.5px]", !kind ? "bg-ink text-bg" : "bg-sunken text-ink-2 hover:text-ink")}>
            All
          </button>
          {KIND_ORDER.filter((k) => counts[k]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => navigate({ to: "/library", search: { scope, kind: k } })}
              className={cn("h-7 rounded-full px-2.5 text-[12.5px]", kind === k ? "bg-ink text-bg" : "bg-sunken text-ink-2 hover:text-ink")}
            >
              {KIND_LABEL[k][1]} <span className="opacity-70">{counts[k]}</span>
            </button>
          ))}
        </div>
        <label htmlFor="lf" className="sr-only">
          Filter
        </label>
        <input id="lf" data-filter value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter  /" className="h-9 rounded-md border border-line-strong bg-surface px-3 outline-none focus:border-accent" />
      </div>
      {lib.isLoading && <Spinner />}
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
              {i.description && <span className="line-clamp-1 text-[12.5px] text-muted">{i.description}</span>}
            </Link>
          </li>
        ))}
      </ul>
      {!lib.isLoading && !shown.length && <p className="px-5 py-4 text-muted">Nothing matches.</p>}
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
            <Empty title={kind ? KIND_LABEL[kind][1] : "Library"}>Pick an item to read or edit it. Items you own can be archived, deleted or turned off.</Empty>
          )
        }
      />
      {creatable && <NewItemDialog open={creating} onClose={() => setCreating(false)} scope={scope} kind={creatable} />}
    </>
  );
}
