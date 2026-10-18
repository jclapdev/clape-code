// The Plugins page's two extra views: searching your marketplaces for plugins to install, and making a
// starter plugin with `claude plugin init`. Both go through Claude Code's own plugin commands on the server,
// and its failures show in its own words.
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ErrorNote, Loading, Tag, useConfirm } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Available {
  pluginId: string;
  name: string;
  marketplaceName: string;
  description?: string;
  version?: string;
  installCount?: number;
}

interface AvailableReply {
  total: number;
  marketplaces: { name: string; count: number }[];
  count: number;
  hits: Available[];
}

const n = (x: number) => x.toLocaleString("en-US");

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function PanelHead({ title, children }: { title: string; children: ReactNode }) {
  return (
    <header className="flex flex-col gap-2 border-b border-line px-4 py-4 md:px-6">
      <h2 className="text-[20px] font-semibold tracking-[-0.01em]">{title}</h2>
      <div className="leading-relaxed text-ink-2">{children}</div>
    </header>
  );
}

function InstallButton({ p }: { p: Available }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const install = useMutation({
    mutationFn: () => api.post<{ message: string }>("/plugins/install", { id: p.pluginId }),
    onSuccess: (r) => {
      toast.success(r.message || `Installed ${p.name}.`);
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message, { duration: 12_000 }),
  });
  return (
    <Button
      size="sm"
      variant="outline"
      busy={install.isPending}
      onClick={async () => {
        const ok = await confirm({
          title: `Install ${p.name}?`,
          body: `Claude Code installs it from ${p.marketplaceName} for you in every project, and new sessions load it. A plugin can run commands on your computer, so install only ones you trust.`,
          confirm: "Install",
        });
        if (ok) install.mutate();
      }}
    >
      <Download aria-hidden /> Install
    </Button>
  );
}

/** Search the plugins your marketplaces offer, and install one. */
export function FindPlugins({ back }: { back: ReactNode }) {
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 250);
  const res = useQuery({
    queryKey: ["plugins-available", query],
    queryFn: () => api.get<AvailableReply>(`/plugins/available?q=${encodeURIComponent(query)}`),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const d = res.data;
  return (
    <div className="h-full overflow-auto">
      {back}
      <PanelHead title="Find plugins">
        {d ? (
          <>
            <p>
              Searching {d.marketplaces.length === 1 ? "1 marketplace" : `${d.marketplaces.length} marketplaces`}, with {n(d.total)} {d.total === 1 ? "plugin" : "plugins"} you haven't installed. The number is how many each offers:
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Marketplaces searched">
              {d.marketplaces.map((m) => (
                <li key={m.name}>
                  <Tag className="max-w-full break-all">
                    {m.name} · {n(m.count)}
                  </Tag>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>Searches your marketplaces for plugins you haven't installed.</p>
        )}
      </PanelHead>
      <div className="flex flex-col gap-3 px-4 py-4 md:px-6">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or what it does" aria-label="Search marketplace plugins" className="h-9 pl-8" autoFocus />
        </div>
        {res.isLoading ? (
          <Loading label="Asking Claude Code for your marketplaces' plugins" />
        ) : res.error ? (
          <ErrorNote error={res.error} onRetry={() => void res.refetch()} />
        ) : d && d.hits.length ? (
          <>
            <p className="text-[13px] text-muted-foreground" aria-live="polite">
              {query ? (d.count > d.hits.length ? `The best ${d.hits.length} of ${n(d.count)} matches` : `${n(d.count)} ${d.count === 1 ? "match" : "matches"}`) : `The ${d.hits.length} most installed`}
            </p>
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
              {d.hits.map((p) => (
                <li key={p.pluginId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 break-words font-medium">{p.name}</span>
                      <Tag className="max-w-full break-all">{p.marketplaceName}</Tag>
                    </span>
                    {p.description && <span className="line-clamp-3 break-words text-[13.5px] leading-relaxed text-ink-2">{p.description}</span>}
                    <span className="text-[12.5px] text-muted-foreground">{p.installCount != null ? `${n(p.installCount)} ${p.installCount === 1 ? "install" : "installs"}` : "No install count"}</span>
                  </div>
                  <div className="flex-none">
                    <InstallButton p={p} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-[13.5px] text-muted-foreground">{d?.total ? "Nothing matches. Try other words." : "Your marketplaces have no plugins you haven't installed. Add a marketplace with /plugin in a session."}</p>
        )}
      </div>
    </div>
  );
}

const PARTS: { id: string; label: string; what: string }[] = [
  { id: "skills", label: "Skills", what: "a skill under skills/, run as /name:skill" },
  { id: "agents", label: "Agents", what: "a subagent under agents/" },
  { id: "hooks", label: "Hooks", what: "hooks/hooks.json, for commands that run on events" },
  { id: "mcp", label: "MCP server", what: "a .mcp.json for a connection to a tool or service" },
  { id: "output-style", label: "Output style", what: "an output style under output-styles/" },
];

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[14px] font-medium">
        {label}
      </label>
      {hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

export interface NewPluginReply {
  id: string;
  path: string;
  manifest: string;
  display: string;
  message: string;
  notes: string;
}

/** Make a starter plugin in your skills folder with `claude plugin init`. */
export function NewPlugin({ back, onCreated }: { back: ReactNode; onCreated: (r: NewPluginReply, name: string) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parts, setParts] = useState<string[]>([]);
  const create = useMutation({
    mutationFn: () => api.post<NewPluginReply>("/plugins-new", { name: name.trim(), description, with: parts }),
    onSuccess: async (r) => {
      toast.success(r.message || `Created ${name}.`, r.notes ? { description: r.notes, duration: 10_000 } : undefined);
      await qc.invalidateQueries();
      onCreated(r, name.trim());
    },
  });
  const valid = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name.trim());
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) create.mutate();
  };
  return (
    <div className="h-full overflow-auto">
      {back}
      <PanelHead title="New plugin">
        <p>
          Claude Code makes a starter plugin folder in <code>~/.claude/skills/</code>. It loads in your new sessions as <code>name@skills-dir</code>, with no install. Add your own skills,
          agents and hooks to the folder, then share it with others.
        </p>
      </PanelHead>
      <form onSubmit={submit} className="flex max-w-[640px] flex-col gap-5 px-4 py-4 md:px-6">
        <Field label="Name" hint="Lowercase letters, numbers and single hyphens, such as my-helper. It becomes the folder name and the start of every command it adds." htmlFor="plugin-name">
          <Input id="plugin-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} autoComplete="off" spellCheck={false} aria-invalid={name !== "" && !valid} />
        </Field>
        <Field label="Description" hint="What it's for, shown in Claude Code's plugin list." htmlFor="plugin-desc">
          <Textarea id="plugin-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        </Field>
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-1 text-[14px] font-medium">Starter parts</legend>
          <p className="-mt-1 text-[13px] text-muted-foreground">Every plugin gets a manifest and a skill named after it. Tick any others to start from.</p>
          {PARTS.map((p) => (
            <label key={p.id} className="flex items-start gap-2.5 text-[14px]">
              <Checkbox checked={parts.includes(p.id)} onCheckedChange={(v) => setParts(v === true ? [...parts, p.id] : parts.filter((x) => x !== p.id))} className="mt-0.5" />
              <span>
                <span className="font-medium">{p.label}</span>: <span className="text-ink-2">{p.what}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {create.error && <p className="rounded-md bg-danger-soft px-3 py-2 text-[13.5px] text-danger">{create.error.message}</p>}
        <div>
          <Button type="submit" disabled={!valid} busy={create.isPending}>
            Create plugin
          </Button>
        </div>
      </form>
    </div>
  );
}
