// One page per Customize feature: what it is, every item wherever it applies, and each item readable,
// editable and deletable. The list takes the full page width; an opened item is its own page with a
// link back to the list.
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { Archive, ChevronLeft, FolderOpen, PackageSearch, Play, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { FEATURES, featureById, type Feature, type FeatureId } from "@/lib/features";
import { day, plural, when } from "@/lib/format";
import type { Catalog, CatalogItem, SlashCommand } from "@/lib/types";
import { FileEditor } from "@/components/FileEditor";
import { ItemActions, isSkillsDirPlugin } from "@/components/ItemActions";
import { FindPlugins, NewPlugin } from "./PluginPanels";
import { toast } from "sonner";
import { PAGE_BAND, PAGE_COLUMN, PAGE_SCROLL, Page } from "@/components/Panes";
import { Readable } from "@/components/Readable";
import { SimpleSelect } from "@/components/SimpleSelect";
import { ErrorNote, Loading, Tag, type Tone } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface FeatureSearch {
  item?: string;
  project?: string;
  q?: string;
  panel?: "find" | "new"; // Plugins page: Find plugins or New plugin, shown where an opened item goes
}

const STATE_LABEL: Record<string, string> = { off: "Turned off", "name-only": "Name only", "user-invocable-only": "Only when you type it" };
const KIND_LABEL: Partial<Record<CatalogItem["kind"], string>> = { rule: "Rule", command: "Command", hook: "Hook script", "claude-md": "CLAUDE.md" };

/** One line in a feature's list: an item from the catalog, or one of Claude Code's own commands. */
interface Row {
  key: string;
  name: string;
  description: string;
  item: CatalogItem | null;
  projectId: string | null;
  command?: string; // what you type to run it, for the Slash commands page
  hint?: string; // what the command takes after its name, such as <path>
  tag?: string; // shown instead of where the item applies
}

/**
 * Claude Code's built-in subagents, each with its description quoted from https://code.claude.com/docs/en/sub-agents.md
 * ("Built-in subagents"): the first line under each name, and the "When Claude uses it" column for the others.
 */
export const BUILT_IN_AGENTS: { name: string; description: string }[] = [
  { name: "Explore", description: "A fast, read-only agent optimized for searching and analyzing codebases." },
  { name: "Plan", description: "A research agent used during plan mode to gather context before presenting a plan." },
  { name: "General-purpose", description: "A capable agent for complex, multi-step tasks that require both exploration and action." },
  { name: "claude", description: "When a task doesn't fit a more specialized agent. A catch-all with every tool available to subagents." },
  { name: "statusline-setup", description: "When you run /statusline to configure your status line" },
  { name: "claude-code-guide", description: "When you ask questions about Claude Code features" },
];

export const keyOf = (i: Pick<CatalogItem, "kind" | "path" | "name" | "projectId" | "meta">) => [i.kind, i.path, i.name, i.projectId ?? "", i.meta?.group ?? "", i.meta?.index ?? ""].join("|");
const baseName = (i: CatalogItem) => (i.folder ? i.folder.split(/[\\/]/).filter(Boolean).pop()! : i.name).replace(/\.md$/, "");
const slashOf = (i: CatalogItem) => (i.kind === "workflow" ? String(i.meta?.command ?? `/${i.name}`) : `/${i.source === "plugin" ? `${i.sourceName}:` : ""}${baseName(i)}`);

/** For a subagent's memory note, the agent that keeps it. */
const agentLabel = (i: CatalogItem | null) => (i?.kind === "memory" && i.meta?.agent ? `Agent: ${i.meta.agent}` : null);
/** A note in a project's .claude/agent-memory-local/: kept on this computer and not shared with the project. */
const onlyYou = (i: CatalogItem | null) => i?.kind === "memory" && i.meta?.scope === "local";

/** Where an item applies, in the words the menu uses. */
export function whereLabel(i: CatalogItem | null) {
  if (!i) return "Built into Claude Code";
  if (i.kind !== "plugin" && i.source === "plugin") return `From plugin ${i.sourceName}`;
  if (i.source === "synced") return "From claude.ai";
  return i.projectName ?? "All projects";
}

function useCatalog() {
  return useQuery({ queryKey: ["catalog"], queryFn: () => api.get<Catalog>("/catalog") });
}

function useLiveCommands(on: boolean) {
  return useQuery({ queryKey: ["live-commands"], queryFn: () => api.get<SlashCommand[]>("/live-commands"), enabled: on });
}

const COMMAND_KINDS: CatalogItem["kind"][] = ["skill", "command", "workflow"];

/** The rows for one feature. Slash commands mixes your own commands with Claude Code's built-in ones. */
function rowsFor(f: Feature, items: CatalogItem[], live: SlashCommand[] | undefined): Row[] {
  if (f.id !== "commands") {
    // A plan's description is its file name; the date it last changed says more.
    const rows: Row[] = items
      .filter((i) => f.kinds.includes(i.kind))
      .map((i) => ({ key: keyOf(i), name: i.name, description: i.kind === "plan" ? (i.mtime ? `Changed ${day(i.mtime)}` : "") : i.description, item: i, projectId: i.projectId }));
    if (f.id === "agents") {
      // The docs: "A user or project subagent named `Explore` overrides the built-in", so yours for every project hides it.
      const yours = new Set(rows.filter((r) => !r.projectId && r.item?.source === "user").map((r) => r.name.toLowerCase()));
      for (const a of BUILT_IN_AGENTS) if (!yours.has(a.name.toLowerCase())) rows.push({ key: `builtin-agent|${a.name}`, name: a.name, description: a.description, item: null, projectId: null, tag: "Built in" });
    }
    return rows;
  }
  const custom = items.filter((i) => COMMAND_KINDS.includes(i.kind));
  const rows: Row[] = custom.map((i) => ({ key: keyOf(i), name: slashOf(i), description: i.description, item: i, projectId: i.projectId, command: slashOf(i) }));
  // Built-in commands come from the docs and the last session (with a tag), minus your own skills and commands.
  const mine = new Set(custom.flatMap((i) => [slashOf(i).slice(1), baseName(i), i.overrideKey ?? ""]));
  // Names starting with __ are Claude Code's internal commands, not ones you type.
  const builtIn = (live ?? []).filter((c) => c.tag && !mine.has(c.name) && !c.name.startsWith("__"));
  for (const c of builtIn)
    rows.push({ key: `builtin|${c.name}`, name: `/${c.name}`, description: c.description, item: null, projectId: null, command: `/${c.name}`, hint: c.argumentHint || undefined, tag: c.tag });
  return rows;
}

function matches(r: Row, q: string, project: string) {
  if (project === "global" && r.projectId) return false;
  // What's built into Claude Code applies in every project.
  if (project && project !== "global" && r.item && r.projectId !== project) return false;
  if (!q) return true;
  const hay = `${r.name} ${r.description} ${r.item?.description ?? ""} ${planStatus(r.item)?.[0] ?? ""}${r.tag ?? whereLabel(r.item)} ${agentLabel(r.item) ?? ""} ${onlyYou(r.item) ? "only you" : ""}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

const PLAN_STATUS: Record<string, [string, Tone]> = { approved: ["Approved", "ok"], "not-approved": ["Not approved", "attn"], draft: ["Draft", "muted"] };
/** A plan's status label and colour, from the last time Claude asked to have it approved. */
const planStatus = (i: CatalogItem | null) => (i?.kind === "plan" ? (PLAN_STATUS[String(i.meta?.status)] ?? null) : null);

function RowTags({ r, f }: { r: Row; f: Feature }) {
  const i = r.item;
  const status = planStatus(i);
  return (
    <>
      <Tag tone={i ? "muted" : "accent"}>{r.tag ?? whereLabel(i)}</Tag>
      {status && <Tag tone={status[1]}>{status[0]}</Tag>}
      {agentLabel(i) && <Tag>{agentLabel(i)}</Tag>}
      {onlyYou(i) && <Tag>Only you</Tag>}
      {i?.kind === "plugin" && <Tag className="max-w-full break-all">{isSkillsDirPlugin(i) ? "Your skills folder" : `From ${String(i.meta?.marketplace ?? i.sourceName)}`}</Tag>}
      {i && f.kinds.length > 1 && KIND_LABEL[i.kind] && f.kinds[0] !== i.kind && <Tag>{KIND_LABEL[i.kind]}</Tag>}
      {i?.state && i.state !== "on" && <Tag>{STATE_LABEL[i.state] ?? i.state}</Tag>}
      {i?.error && <Tag tone="danger">Has a mistake</Tag>}
    </>
  );
}

function NewLink({ f, project }: { f: Feature; project: string }) {
  if (!f.create) return null;
  const search: Record<string, string> = { ...f.create.search };
  if (project) {
    if (f.create.to === "/sessions/new") {
      if (project !== "global") search.project = project;
    } else search.scope = project;
  }
  return (
    <Button asChild className="no-underline">
      <Link to={f.create.to} search={search}>
        <Plus aria-hidden /> {f.create.label}
      </Link>
    </Button>
  );
}

function PluginLinks() {
  const search = useSearch({ strict: false }) as FeatureSearch;
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant={search.panel === "find" ? "default" : "outline"} className="no-underline">
        <Link to="/plugins" search={{ ...search, item: undefined, panel: "find" } as never}>
          <PackageSearch aria-hidden /> Find plugins
        </Link>
      </Button>
      <Button asChild variant={search.panel === "new" ? "default" : "outline"} className="no-underline">
        <Link to="/plugins" search={{ ...search, item: undefined, panel: "new" } as never}>
          <Plus aria-hidden /> New plugin
        </Link>
      </Button>
    </div>
  );
}

function RunLink({ r }: { r: Row }) {
  if (!r.command) return null;
  return (
    <Button asChild variant="outline" size="sm" className="no-underline">
      <Link to="/sessions/new" search={{ prompt: r.command, ...(r.projectId ? { project: r.projectId } : {}) }}>
        <Play aria-hidden /> Run in a new session
      </Link>
    </Button>
  );
}

function Fields({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-md bg-sunken px-4 py-3 text-[13.5px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const MCP_SCOPE: Record<string, string> = { user: "Your settings, for every project", local: "Your settings for this project only", project: "The project's .mcp.json, shared with everyone who uses it", plugin: "Its plugin" };

/** What an item says, read-only: formatted text for files, the essentials for hooks, servers and built-in commands. */
function ItemBody({ r }: { r: Row }) {
  const i = r.item;
  if (!i)
    return (
      <div className="flex flex-col gap-2 leading-relaxed text-ink-2">
        {r.description && <p>{r.description}</p>}
        {r.hint && (
          <p>
            Takes <code className="break-all">{r.hint}</code>
          </p>
        )}
        <p className="text-muted-foreground">It's built into Claude Code, so it can't be changed here.</p>
      </div>
    );
  if (i.kind === "hook-def") {
    return (
      <Fields
        rows={[
          ["When", i.meta.matcher ? `${i.meta.event}, for ${i.meta.matcher}` : i.meta.event],
          ["It runs", <code className="whitespace-pre-wrap break-all">{i.description}</code>],
          ["Set in", <span className="font-mono text-[12.5px]">{i.display}</span>],
        ]}
      />
    );
  }
  if (i.kind === "mcp") {
    return (
      <Fields
        rows={[
          ["Connects by", i.meta.type],
          ["Runs", <code className="break-all">{i.meta.runs || "Not shown"}</code>],
          ["Set in", MCP_SCOPE[i.meta.scope] ?? i.display],
        ]}
      />
    );
  }
  if (i.kind === "plugin") return <PluginBody i={i} />;
  if (i.kind === "plan") return <PlanBody i={i} />;
  return <Readable path={i.path} editLink={false} />;
}

interface PlanConversation {
  sessionId: string;
  title: string;
  at: string | null;
}

/** A plan: the conversations that worked on it, newest first, then its text. */
function PlanBody({ i }: { i: CatalogItem }) {
  const convs = Array.isArray(i.meta.conversations) ? (i.meta.conversations as PlanConversation[]) : [];
  return (
    <div className="flex flex-col gap-4">
      {convs.length > 0 && (
        <section aria-label="Conversations" className="flex flex-col gap-2">
          <h3 className="text-[15px] font-semibold">Conversations</h3>
          <ul className="flex flex-col rounded-md border border-line bg-surface text-[13.5px]">
            {convs.map((c) => (
              <li key={c.sessionId} className="border-b border-line last:border-b-0">
                <Link to="/sessions/$sid" params={{ sid: c.sessionId }} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-ink no-underline hover:bg-sunken">
                  <span className="min-w-0 break-words">{c.title}</span>
                  <span className="flex-none text-[12.5px] text-muted-foreground">{when(c.at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Readable path={i.path} editLink={false} />
    </div>
  );
}

/** A plugin: where it comes from, the files in its folder (each opens readable and editable where allowed), and its manifest. */
function PluginBody({ i }: { i: CatalogItem }) {
  const files = Array.isArray(i.meta.files) ? (i.meta.files as string[]) : [];
  const folder = i.folder ?? i.path.replace(/[\\/]\.claude-plugin[\\/]plugin\.json$/, "");
  const folderShown = i.display.replace(/[\\/]\.claude-plugin[\\/]plugin\.json$/, "");
  const sep = folder.includes("\\") ? "\\" : "/";
  const open = async () => {
    try {
      await api.post("/open", { path: folder });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <Fields
        rows={[
          ["Id", <code className="break-all">{i.overrideKey}</code>],
          ["Version", String(i.meta.version ?? "Not given")],
          ["Comes from", isSkillsDirPlugin(i) ? "Your skills folder. It loads without installing." : `The ${String(i.meta.marketplace)} marketplace`],
          ["Folder", <span className="break-all font-mono text-[12.5px]">{folderShown}</span>],
        ]}
      />
      <section aria-label="Files in the plugin" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold">Files</h3>
          <Button size="sm" variant="outline" onClick={open}>
            <FolderOpen aria-hidden /> Open folder
          </Button>
        </div>
        {files.length ? (
          <ul className="flex flex-col rounded-md border border-line bg-surface text-[13px]">
            {files.map((f) => (
              <li key={f} className="border-b border-line last:border-b-0">
                <Link to="/file" search={{ path: `${folder}${sep}${f.split("/").join(sep)}` }} className="block break-all px-3 py-1.5 font-mono no-underline hover:bg-sunken">
                  {f}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] text-muted-foreground">No files found.</p>
        )}
        {files.length >= 60 && <p className="text-[13px] text-muted-foreground">Showing the first 60 files.</p>}
      </section>
      <section aria-label="Manifest" className="flex flex-col gap-2">
        <h3 className="text-[15px] font-semibold">Manifest</h3>
        <Readable path={i.path} editLink={false} />
      </section>
    </div>
  );
}

// Marketplace plugins are Claude Code's own copies; a plugin in your skills folder is yours to edit.
const canEdit = (i: CatalogItem | null) => !!i && i.access === "edit" && (i.kind !== "plugin" || isSkillsDirPlugin(i));

function ItemView({ r, f, back, onDeleted }: { r: Row; f: Feature; back: ReactNode; onDeleted: () => void }) {
  const [editing, setEditing] = useState(false);
  // While deleting, stop showing (and re-fetching) the file: the watcher reports the move before the reply arrives.
  const [gone, setGone] = useState(false);
  const i = r.item;
  const header = (
    <header className={`flex-none border-b border-line ${editing ? PAGE_BAND : ""}`}>
      <div className={`${PAGE_COLUMN} flex flex-col gap-3 py-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-[20px] font-semibold tracking-[-0.01em]">{r.name}</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <RowTags r={r} f={f} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <RunLink r={r} />
          {canEdit(i) && (
            <Button size="sm" variant={editing ? "default" : "outline"} onClick={() => setEditing(!editing)}>
              {editing ? "Back to reading" : "Edit"}
            </Button>
          )}
        </div>
      </div>
      {i?.kind === "workflow" && !editing && i.description && <p className="leading-relaxed text-ink-2">{i.description}</p>}
      {i && <ItemActions i={i} scope={i.projectId ?? "global"} projectId={i.projectId} onDeleting={setGone} onDeleted={onDeleted} />}
      </div>
    </header>
  );
  if (gone)
    return (
      <div className={PAGE_SCROLL}>
        {back}
        {header}
      </div>
    );
  if (editing && i) {
    return (
      <div className="flex h-full flex-col">
        {back}
        <div className="min-h-0 flex-1">
          <FileEditor path={i.path} line={i.line} header={header} />
        </div>
      </div>
    );
  }
  return (
    <div className={PAGE_SCROLL}>
      {back}
      {header}
      <div className={`${PAGE_COLUMN} py-4`}>
        <ItemBody r={r} />
      </div>
    </div>
  );
}

function ListHead({ f, count, total, q, setQ, project, setProject, projects }: { f: Feature; count: number; total: number; q: string; setQ: (v: string) => void; project: string; setProject: (v: string) => void; projects: { id: string; name: string }[] }) {
  return (
    <div className="flex flex-col gap-3 px-4 pb-3 pt-5 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-[24px] font-semibold tracking-[-0.01em]">{f.label}</h1>
        {f.id === "plugins" ? <PluginLinks /> : <NewLink f={f} project={project} />}
      </div>
      {f.guide && (
        <Link to="/guides/$slug" params={{ slug: f.guide }} className="self-start text-[13.5px]">
          Read the guide
        </Link>
      )}
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label={`Search ${f.label.toLowerCase()}`} className="h-9 pl-8" />
        </div>
        <SimpleSelect
          label="Show items for"
          value={project}
          onChange={setProject}
          className="h-9 min-w-[160px]"
          options={[{ value: "", label: "Every project" }, { value: "global", label: "All projects only" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
        />
      </div>
      <p className="text-[13px] text-muted-foreground">{count === total ? plural(total, "item") : `${count} of ${plural(total, "item")}`}</p>
    </div>
  );
}

export function FeaturePage() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const f = featureById(path.split("/")[1] ?? "") ?? FEATURES[0];
  const search = useSearch({ strict: false }) as FeatureSearch;
  const navigate = useNavigate();
  const cat = useCatalog();
  const live = useLiveCommands(f.id === "commands");
  const project = search.project ?? "";
  const [q, setQLocal] = useState(search.q ?? "");
  useEffect(() => setQLocal(search.q ?? ""), [f.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (next: Partial<FeatureSearch>, replace = false) =>
    void navigate({ to: `/${f.id}`, search: (s: FeatureSearch) => ({ ...s, ...next }) as never, replace });
  const setQ = (v: string) => {
    setQLocal(v);
    go({ q: v || undefined }, true);
  };

  const rows = useMemo(() => rowsFor(f, cat.data?.items ?? [], live.data), [f, cat.data, live.data]);
  const shown = useMemo(() => rows.filter((r) => matches(r, q, project)).sort((a, b) => a.name.localeCompare(b.name)), [rows, q, project]);

  if (cat.isLoading) return <Loading />;
  if (cat.error) return <ErrorNote error={cat.error} />;

  // A conversation links to its plan by the plan's path, since it doesn't know the plan's project.
  const selected = rows.find((r) => r.key === search.item) ?? (f.id === "plans" ? rows.find((r) => r.item?.path === search.item) : undefined) ?? null;
  const close = () => go({ item: undefined });
  const panel = f.id === "plugins" && !selected ? search.panel : undefined;
  const panelView = (back: ReactNode) =>
    panel === "find" ? (
      <FindPlugins back={back} />
    ) : panel === "new" ? (
      <NewPlugin
        back={back}
        onCreated={(r, name) => go({ panel: undefined, q: undefined, project: undefined, item: keyOf({ kind: "plugin", path: r.manifest, name, projectId: null, meta: {} }) })}
      />
    ) : null;

  const list = (
    <>
      <ListHead f={f} count={shown.length} total={rows.length} q={q} setQ={setQ} project={project} setProject={(v) => go({ project: v || undefined }, true)} projects={cat.data!.projects} />
      {shown.length ? (
        <ul className="mx-4 mb-6 divide-y divide-line rounded-lg border border-line bg-surface md:mx-6">
          {shown.map((r) => (
            <li key={r.key}>
              <Link to={`/${f.id}`} search={{ ...search, item: r.key, panel: undefined } as never} className="flex flex-col gap-1 px-4 py-3 text-ink no-underline hover:bg-sunken">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 break-words font-medium">{r.name}</span>
                  {r.hint && <code className="min-w-0 break-all text-[13px] text-muted-foreground">{r.hint}</code>}
                  <RowTags r={r} f={f} />
                </span>
                {r.description && <span className="line-clamp-2 text-[13.5px] leading-relaxed text-ink-2">{r.description}</span>}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mx-4 mb-6 text-[13.5px] text-muted-foreground md:mx-6">{rows.length ? "Nothing matches. Try other words or another project." : `No ${f.label.toLowerCase()} yet.`}</p>
      )}
    </>
  );

  if (selected) {
    const back = (
      <Link to={`/${f.id}`} search={{ ...search, item: undefined } as never} className="flex h-11 items-center gap-1 border-b border-line px-3 text-[13.5px] no-underline">
        <ChevronLeft className="size-4" aria-hidden /> {f.label}
      </Link>
    );
    return <ItemView key={selected.key} r={selected} f={f} back={back} onDeleted={close} />;
  }
  if (panel) {
    return panelView(
      <Link to={`/${f.id}`} search={{ ...search, panel: undefined } as never} className="flex h-11 items-center gap-1 border-b border-line px-3 text-[13.5px] no-underline">
        <ChevronLeft className="size-4" aria-hidden /> {f.label}
      </Link>,
    );
  }
  return (
    <section aria-label={f.label} className={PAGE_SCROLL}>
      <div className="mx-auto max-w-[1180px] md:px-2">{list}</div>
    </section>
  );
}

/** Counts per feature, for the Customize overview. */
function countFor(id: FeatureId, items: CatalogItem[], live: SlashCommand[] | undefined) {
  return rowsFor(featureById(id)!, items, live).length;
}

export function CustomizePage() {
  const cat = useCatalog();
  const live = useLiveCommands(true);
  if (cat.isLoading) return <Loading />;
  if (cat.error) return <ErrorNote error={cat.error} />;
  const items = cat.data!.items;
  return (
    <Page title="Customize">
      <ul className="grid auto-rows-fr gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {FEATURES.map((f) => {
          const n = countFor(f.id, items, live.data);
          return (
            <li key={f.id}>
              <Link to={`/${f.id}`} className="flex h-full flex-col gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-ink no-underline hover:border-line-strong">
                <span className="flex items-center gap-2">
                  <f.icon className="size-4 flex-none text-muted-foreground" aria-hidden />
                  <span className="flex-1 font-medium">{f.label}</span>
                  <span className="text-[13px] text-muted-foreground">{n}</span>
                </span>
              </Link>
            </li>
          );
        })}
        <li>
          <Link to="/archive" className="flex h-full flex-col gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-ink no-underline hover:border-line-strong">
            <span className="flex items-center gap-2">
              <Archive className="size-4 flex-none text-muted-foreground" aria-hidden />
              <span className="flex-1 font-medium">Archived items</span>
            </span>
          </Link>
        </li>
      </ul>
    </Page>
  );
}
