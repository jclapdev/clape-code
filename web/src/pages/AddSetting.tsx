// Add a permission rule, a hook or an MCP server without editing JSON, with the official guide beside the form.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SimpleSelect } from "@/components/SimpleSelect";
import { GuideText } from "./Guides";

export type AddWhat = "permission" | "hook" | "mcp";

const HOOK_EVENTS = [
  { value: "PreToolUse", label: "Before Claude uses a tool (can stop it)" },
  { value: "PostToolUse", label: "After Claude uses a tool" },
  { value: "UserPromptSubmit", label: "When you send a message" },
  { value: "Stop", label: "When Claude finishes a reply" },
  { value: "SubagentStop", label: "When an agent finishes" },
  { value: "Notification", label: "When Claude needs your attention" },
  { value: "SessionStart", label: "When a session starts" },
  { value: "SessionEnd", label: "When a session ends" },
  { value: "PreCompact", label: "Before the conversation is summarised" },
];

const LISTS = [
  { value: "allow", label: "Allowed without asking" },
  { value: "ask", label: "Always ask me first" },
  { value: "deny", label: "Never allowed" },
];

const SPEC: Record<AddWhat, { title: string; intro: string; guide: string; section: string }> = {
  permission: { title: "New permission rule", intro: "Decide which actions Claude may take without asking, must always ask about, or may never take.", guide: "settings", section: "settings" },
  hook: { title: "New hook", intro: "A hook is a command Claude Code runs on its own at a set moment, every time, such as formatting a file after Claude edits it.", guide: "hooks", section: "hooks" },
  mcp: { title: "Add an MCP server", intro: "An MCP server connects Claude to an outside tool or service, such as GitHub, a database or Notion.", guide: "mcp", section: "mcp" },
};

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

export function AddSettingPage() {
  const search = useSearch({ strict: false }) as { what?: AddWhat; scope?: string };
  const what: AddWhat = search.what && search.what in SPEC ? search.what : "permission";
  const spec = SPEC[what];
  const navigate = useNavigate();
  const qc = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/projects") });
  const [scope, setScope] = useState(search.scope ?? "global");
  const [local, setLocal] = useState("shared");
  const [list, setList] = useState("allow");
  const [rule, setRule] = useState("");
  const [event, setEvent] = useState("PostToolUse");
  const [matcher, setMatcher] = useState("");
  const [command, setCommand] = useState("");
  const [name, setName] = useState("");
  const [transport, setTransport] = useState("http");
  const [target, setTarget] = useState("");
  const [env, setEnv] = useState("");

  const save = useMutation({
    mutationFn: () =>
      what === "mcp"
        ? api.post("/mcp/add", { scope, name, transport, target, env })
        : api.post("/settings/add", { scope, local: local === "local", what, list, rule, event, matcher, command }),
    onSuccess: () => {
      void qc.invalidateQueries();
      if (scope === "global") void navigate(what === "permission" ? { to: "/settings", search: {}, hash: "permissions" } : { to: `/${spec.section}` as "/hooks" });
      else void navigate({ to: "/projects/$id", params: { id: scope }, search: {}, hash: spec.section });
    },
  });

  const scopes = [{ value: "global", label: "All projects" }, ...(projects.data ?? []).filter((p) => p.group === "root").map((p) => ({ value: p.id, label: p.name }))];
  const ready = what === "permission" ? !!rule.trim() : what === "hook" ? !!command.trim() : !!name.trim() && !!target.trim();

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-auto">
        <form
          className="mx-auto flex max-w-[720px] flex-col gap-5 px-6 py-8"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) save.mutate();
          }}
        >
          <div>
            <h1 className="text-[24px] font-semibold">{spec.title}</h1>
            <p className="mt-1 text-ink-2">{spec.intro}</p>
          </div>
          <Field label="Where it applies" htmlFor="scope">
            <SimpleSelect id="scope" label="Where it applies" value={scope} onChange={setScope} options={scopes} />
          </Field>
          {scope !== "global" && what !== "mcp" && (
            <Field label="Who it's for" htmlFor="who">
              <SimpleSelect
                id="who"
                label="Who it's for"
                value={local}
                onChange={setLocal}
                options={[
                  { value: "shared", label: "Everyone working on this project (settings.json)" },
                  { value: "local", label: "Only me (settings.local.json)" },
                ]}
              />
            </Field>
          )}
          {what === "permission" && (
            <>
              <Field label="What happens" htmlFor="list">
                <SimpleSelect id="list" label="What happens" value={list} onChange={setList} options={LISTS} />
              </Field>
              <Field label="The action" hint="Examples: Bash(npm run test) for one command, Bash(git *) for every git command, Edit(src/**) for edits under src, WebFetch(domain:github.com) for one website." htmlFor="rule">
                <Input id="rule" value={rule} onChange={(e) => setRule(e.target.value)} />
              </Field>
            </>
          )}
          {what === "hook" && (
            <>
              <Field label="When it runs" htmlFor="event">
                <SimpleSelect id="event" label="When it runs" value={event} onChange={setEvent} options={HOOK_EVENTS} />
              </Field>
              {(event === "PreToolUse" || event === "PostToolUse") && (
                <Field label="For which tools" hint="Tool names separated by |, such as Edit|Write or Bash. Leave empty for every tool." htmlFor="matcher">
                  <Input id="matcher" value={matcher} onChange={(e) => setMatcher(e.target.value)} />
                </Field>
              )}
              <Field label="Command to run" hint="Runs in your shell. It gets the details as JSON on its input, for example the file Claude just edited." htmlFor="command">
                <Textarea id="command" rows={3} value={command} onChange={(e) => setCommand(e.target.value)} />
              </Field>
            </>
          )}
          {what === "mcp" && (
            <>
              <Field label="Name" hint="How Claude refers to it, such as github." htmlFor="name">
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="How it connects" htmlFor="transport">
                <SimpleSelect
                  id="transport"
                  label="How it connects"
                  value={transport}
                  onChange={setTransport}
                  options={[
                    { value: "http", label: "Web address (most hosted servers)" },
                    { value: "stdio", label: "A program on this computer" },
                    { value: "sse", label: "Web address, older streaming kind" },
                  ]}
                />
              </Field>
              <Field label={transport === "stdio" ? "Command that starts it" : "Address"} hint={transport === "stdio" ? "Such as npx -y @modelcontextprotocol/server-github" : "Such as https://mcp.notion.com/mcp"} htmlFor="target">
                <Input id="target" value={target} onChange={(e) => setTarget(e.target.value)} />
              </Field>
              {transport === "stdio" && (
                <Field label="Environment variables" hint="One per line, such as GITHUB_TOKEN=… They're stored by Claude Code and not shown here again." htmlFor="env">
                  <Textarea id="env" rows={2} value={env} onChange={(e) => setEnv(e.target.value)} />
                </Field>
              )}
            </>
          )}
          {save.error && <p className="text-[14px] text-danger">{(save.error as Error).message}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="lg" busy={save.isPending} disabled={!ready}>
              {what === "mcp" ? "Add server" : "Add"}
            </Button>
            <Button type="button" size="lg" variant="outline" onClick={() => history.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
      <aside aria-label="Guide" className="hidden w-[440px] flex-none overflow-auto border-l border-line bg-panel px-5 py-4 text-[14px] lg:block">
        <GuideText slug={spec.guide} />
      </aside>
    </div>
  );
}
