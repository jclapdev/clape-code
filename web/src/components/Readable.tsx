// Shows a file the way a person reads it: header fields as labelled values, markdown formatted,
// JSON as labelled values and lists. Editing the raw text stays one link away.
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { fileQuery } from "./FileEditor";
import { ErrorNote, Loading, Md } from "./ui";

const LABELS: Record<string, string> = {
  name: "Name",
  description: "What it's for",
  tools: "Tools it can use",
  "allowed-tools": "Tools it may use without asking",
  "disallowed-tools": "Tools it can't use",
  model: "Model",
  effort: "Effort",
  "argument-hint": "Arguments",
  "disable-model-invocation": "Runs only when you type it",
  "user-invocable": "You can run it with /name",
  paths: "Applies to files matching",
  type: "Type",
  memory: "Keeps its own memory",
  color: "Colour",
  permissions: "Permissions",
  allow: "Allowed without asking",
  deny: "Never allowed",
  ask: "Always asks first",
  hooks: "Hooks",
  env: "Environment variables",
  mcpServers: "MCP servers",
};

const label = (k: string) => LABELS[k] ?? k.replace(/[-_]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

/** Reads simple YAML front matter: `key: value`, and `- item` lists under a key. Anything fancier is shown as text. */
export function splitFrontmatter(text: string): { fields: [string, string | string[]][]; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { fields: [], body: text };
  const fields: [string, string | string[]][] = [];
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (kv) fields.push([kv[1], kv[2].replace(/^["']|["']$/g, "").replace(/^>-?$|^\|-?$/, "")]);
    else if (item && fields.length) {
      const last = fields[fields.length - 1];
      last[1] = [...(Array.isArray(last[1]) ? last[1] : last[1] ? [last[1]] : []), item[1]];
    } else if (line.trim() && fields.length) {
      const last = fields[fields.length - 1];
      if (!Array.isArray(last[1])) last[1] = `${last[1]} ${line.trim()}`.trim();
    }
  }
  return { fields, body: text.slice(m[0].length) };
}

function Value({ v }: { v: unknown }): ReactNode {
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">Not set</span>;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) {
    if (!v.length) return <span className="text-muted-foreground">None</span>;
    return (
      <ul className="flex flex-col gap-1">
        {v.map((x, i) => (
          <li key={i} className="break-words">
            {typeof x === "object" ? <Fields obj={x as Record<string, unknown>} /> : <code className="rounded bg-sunken px-1.5 py-0.5 text-[12.5px]">{String(x)}</code>}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof v === "object") return <Fields obj={v as Record<string, unknown>} />;
  return <span className="break-words">{String(v)}</span>;
}

function Fields({ obj }: { obj: Record<string, unknown> | [string, unknown][] }) {
  const entries = Array.isArray(obj) ? obj : Object.entries(obj);
  if (!entries.length) return <span className="text-muted-foreground">Empty</span>;
  return (
    <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(140px,auto)_1fr]">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[13px] text-muted-foreground">{label(k)}</dt>
          <dd className="min-w-0 text-[14px]">
            <Value v={v} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Readable({ path, editLink = true }: { path: string; editLink?: boolean }) {
  const f = useQuery(fileQuery(path));
  if (f.error) return <ErrorNote error={f.error} />;
  if (!f.data) return <Loading />;
  const text = f.data.content ?? "";
  let view: ReactNode;
  if (/\.json$/i.test(path)) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    view = parsed && typeof parsed === "object" ? <Fields obj={parsed as Record<string, unknown>} /> : <pre className="overflow-auto whitespace-pre-wrap text-[13px]">{text}</pre>;
  } else if (/\.(md|markdown)$/i.test(path)) {
    const { fields, body } = splitFrontmatter(text);
    view = (
      <div className="flex flex-col gap-4">
        {fields.length > 0 && (
          <div className="rounded-md bg-sunken px-4 py-3">
            <Fields obj={fields} />
          </div>
        )}
        {body.trim() && <Md nested>{body}</Md>}
      </div>
    );
  } else {
    view = <pre className="overflow-auto whitespace-pre-wrap rounded-md bg-sunken p-3 text-[13px]">{text}</pre>;
  }
  return (
    <div className="flex flex-col gap-3">
      {view}
      {editLink && (
        <Link to="/file" search={{ path }} className="self-start text-[13px]">
          Edit
        </Link>
      )}
    </div>
  );
}
