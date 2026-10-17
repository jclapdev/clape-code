import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { api, enc } from "@/lib/api";
import type { Access, Project } from "@/lib/types";
import { Page } from "@/components/Panes";
import { cn, ErrorNote, Spinner, Tag } from "@/components/ui";

type Source = "managed" | "local" | "project" | "user";
interface Entry {
  key: string;
  value: unknown;
  from: Source | "combined";
  setIn: Source[];
  overridden: { source: Source; value: unknown }[];
}
interface SettingsData {
  sources: { source: Source; path: string; display: string; exists: boolean; access: Access; error: string | null }[];
  entries: Entry[];
}

const SOURCE_LABEL: Record<Source | "combined", string> = { managed: "Managed", local: "Local", project: "Project", user: "User", combined: "Combined" };
const SOURCE_TONE: Record<Source | "combined", "danger" | "attn" | "accent" | "ok" | "muted"> = { managed: "danger", local: "attn", project: "accent", user: "ok", combined: "muted" };
const SOURCE_HELP: Record<Source, string> = {
  managed: "Set by an organization. Nothing overrides it.",
  local: "Your settings for this project only, not shared.",
  project: "Shared with everyone who uses the project's repository.",
  user: "Your settings for every project.",
};

function summary(v: unknown): string {
  if (Array.isArray(v)) return `${v.length} ${v.length === 1 ? "entry" : "entries"}`;
  if (v && typeof v === "object") {
    const k = Object.keys(v);
    if (k.length <= 3) return k.join(", ");
    return `${k.length} keys`;
  }
  return JSON.stringify(v);
}

export function SettingsPage() {
  const s = useSearch({ strict: false }) as { project?: string; key?: string };
  const navigate = useNavigate();
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/projects") });
  const q = useQuery({ queryKey: ["settings", s.project ?? ""], queryFn: () => api.get<SettingsData>(`/settings${s.project ? `?project=${enc(s.project)}` : ""}`) });
  const sel = q.data?.entries.find((e) => e.key === s.key) ?? q.data?.entries[0];
  const fileFor = (src: Source) => q.data?.sources.find((x) => x.source === src);

  return (
    <Page
      title="Settings"
      sub="What Claude Code uses, and which file each value comes from."
      actions={
        <label className="flex items-center gap-2 text-[13px] text-muted">
          Show settings for
          <select value={s.project ?? ""} onChange={(e) => navigate({ to: "/settings", search: { project: e.target.value || undefined } })} className="h-9 rounded-md border border-line-strong bg-surface px-2 text-[13.5px] text-ink">
            <option value="">No project (user settings only)</option>
            {(projects.data ?? [])
              .filter((p) => p.hasClaudeDir)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
      }
    >
      {q.isLoading && <Spinner />}
      <ErrorNote error={q.error} />
      {q.data && (
        <div className="flex flex-col gap-5">
          <section aria-label="Which file wins" className="flex flex-col gap-2">
            <p className="text-[13px] text-muted">When two files set the same thing, the one further left wins. Lists such as permission rules are combined across files.</p>
            <ol className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
              {q.data.sources.map((f) => (
                <li key={f.source} className={cn("flex flex-col gap-1 rounded-lg border bg-surface px-3.5 py-3", f.exists ? "border-line" : "border-dashed border-line opacity-60")}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{SOURCE_LABEL[f.source]}</span>
                    {f.error ? <Tag tone="danger">Invalid JSON</Tag> : !f.exists && <span className="text-xs text-muted">not created</span>}
                  </span>
                  <span className="break-all font-mono text-[11.5px] text-muted">{f.display}</span>
                  <span className="text-xs text-ink-2">{SOURCE_HELP[f.source]}</span>
                  {f.access === "edit" && (
                    <Link to="/file" search={{ path: f.path }} className="text-[13px]">
                      {f.exists ? "Edit" : "Create"}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </section>
          <div className="flex flex-wrap items-start gap-4">
            <section aria-label="Effective values" className="min-w-0 flex-[999_1_520px] overflow-hidden rounded-lg border border-line bg-surface">
              <div className="grid grid-cols-[minmax(150px,1.1fr)_minmax(120px,1.4fr)_100px] gap-3 border-b border-line px-4 py-2 text-xs text-muted">
                <span>Setting</span>
                <span>Value</span>
                <span>From</span>
              </div>
              {q.data.entries.map((e) => (
                <button
                  key={e.key}
                  type="button"
                  aria-pressed={sel?.key === e.key}
                  onClick={() => navigate({ to: "/settings", search: { project: s.project, key: e.key }, replace: true })}
                  className={cn("grid min-h-11 w-full grid-cols-[minmax(150px,1.1fr)_minmax(120px,1.4fr)_100px] items-center gap-3 border-b border-line px-4 py-2 text-left last:border-0 hover:bg-sunken/60", sel?.key === e.key && "bg-accent-soft/50")}
                >
                  <span className="truncate font-mono text-[12.5px]">{e.key}</span>
                  <span className="truncate text-ink-2">{summary(e.value)}</span>
                  <span><Tag tone={SOURCE_TONE[e.from]}>{SOURCE_LABEL[e.from]}</Tag></span>
                </button>
              ))}
              {!q.data.entries.length && <p className="px-4 py-3 text-muted">No settings set in these files.</p>}
            </section>
            {sel && (
              <aside aria-label="Setting details" className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 rounded-lg border border-line bg-surface p-4">
                <div className="font-mono text-[13px] font-medium">{sel.key}</div>
                <p className="text-[13px] text-ink-2">
                  {sel.from === "combined"
                    ? `Combined from ${sel.setIn.map((x) => SOURCE_LABEL[x].toLowerCase()).join(" and ")} settings.`
                    : sel.overridden.length
                      ? `${SOURCE_LABEL[sel.from]} settings win over ${sel.overridden.map((o) => SOURCE_LABEL[o.source].toLowerCase()).join(" and ")}.`
                      : `Set only in ${SOURCE_LABEL[sel.from].toLowerCase()} settings.`}
                </p>
                <pre className="max-h-80 overflow-auto rounded-md bg-sunken p-2.5 font-mono text-[12px]">{JSON.stringify(sel.value, null, 2)}</pre>
                {sel.overridden.map((o) => (
                  <div key={o.source} className="text-[12.5px] text-muted">
                    Ignored from {SOURCE_LABEL[o.source].toLowerCase()}: <span className="font-mono">{JSON.stringify(o.value)}</span>
                  </div>
                ))}
                <div className="flex flex-wrap gap-3">
                  {sel.setIn.map((src) => {
                    const f = fileFor(src);
                    return f?.access === "edit" ? (
                      <Link key={src} to="/file" search={{ path: f.path }} className="text-[13px]">
                        Edit {SOURCE_LABEL[src].toLowerCase()} settings
                      </Link>
                    ) : null;
                  })}
                </div>
              </aside>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}
