// Create a skill, command, agent, rule, output style, memory note or instructions file from a short form,
// with the official guide for that kind beside it.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SimpleSelect } from "@/components/SimpleSelect";
import { cn } from "@/components/ui";
import { GuideText } from "./Guides";

export type NewKind = "skill" | "command" | "agent" | "rule" | "output-style" | "memory" | "instructions";

interface KindSpec {
  title: string;
  intro: string;
  guides: { slug: string; label: string }[];
  name?: string;
  description?: { label: string; hint: string; required: boolean };
  body: { label: string; hint: string };
  section: string;
  projectOnly?: boolean;
}

export const KINDS: Record<NewKind, KindSpec> = {
  skill: {
    title: "New skill",
    intro: "A skill teaches Claude a task or gives it know-how. Claude uses it when your request matches the description, or when you type /name.",
    guides: [
      { slug: "skill-best-practices", label: "Writing a good skill" },
      { slug: "skill-descriptions", label: "Writing the description" },
      { slug: "skills", label: "How skills work" },
    ],
    name: "Lowercase letters, numbers and hyphens, such as review-pr. You'll run it as /review-pr.",
    description: { label: "What it does and when to use it", hint: "Claude reads this to decide when to use the skill. Name the task and the words people use for it.", required: true },
    body: { label: "Instructions", hint: "The steps Claude follows, with examples. Keep it under 500 lines." },
    section: "skills",
  },
  command: {
    title: "New command",
    intro: "A command is a prompt you run by typing /name. Claude Code now saves commands as skills that only run when you type them.",
    guides: [{ slug: "skills", label: "How skills and commands work" }],
    name: "Lowercase letters, numbers and hyphens. You'll run it as /name.",
    description: { label: "What it does", hint: "Shown next to the command when you type /.", required: true },
    body: { label: "The prompt", hint: "What Claude should do when you run it. Write $ARGUMENTS where anything you type after the command should go." },
    section: "skills",
  },
  agent: {
    title: "New agent",
    intro: "An agent is a helper with its own instructions, tools and model. Claude hands it work that matches its description and gets a summary back.",
    guides: [{ slug: "agents", label: "Agents (subagents)" }],
    name: "Lowercase letters, numbers and hyphens, such as code-reviewer.",
    description: { label: "When Claude should hand work to it", hint: 'Claude reads this to decide when to delegate. Add "Use proactively" if it should step in on its own.', required: true },
    body: { label: "Its instructions", hint: "Who the agent is and how it works. This becomes its system prompt." },
    section: "agents",
  },
  rule: {
    title: "New rule",
    intro: "A rule is an instruction Claude follows when it works on certain files, such as everything under src/api.",
    guides: [{ slug: "memory", label: "Instructions and rules" }],
    name: "A short file name, such as api-design.",
    body: { label: "The rule", hint: "What Claude should do when working on those files." },
    section: "rules",
  },
  "output-style": {
    title: "New output style",
    intro: "An output style changes how Claude writes every reply in a session, such as shorter answers or a different role. Pick it with /output-style.",
    guides: [{ slug: "output-styles", label: "Output styles" }],
    name: "A short name, such as terse.",
    description: { label: "What it changes", hint: "Shown in the style picker.", required: false },
    body: { label: "Instructions for Claude", hint: "How Claude should respond while this style is on." },
    section: "output-styles",
  },
  memory: {
    title: "New memory note",
    intro: "A note Claude reads at the start of every session in this project, listed in the project's memory index.",
    guides: [{ slug: "memory", label: "Instructions and memory" }],
    name: "A short file name, such as testing-setup.",
    description: { label: "One line about it", hint: "Shown in the memory index Claude reads.", required: false },
    body: { label: "The note", hint: "What Claude should remember." },
    section: "memory",
    projectOnly: true,
  },
  instructions: {
    title: "New instructions",
    intro: "Instructions Claude reads at the start of every session: commands it can't guess, code style, and how you like to work.",
    guides: [
      { slug: "memory", label: "Writing CLAUDE.md" },
      { slug: "best-practices", label: "Best practices" },
    ],
    body: { label: "Instructions", hint: "Keep it short. For each line ask: would Claude make mistakes without it?" },
    section: "instructions",
  },
};

const TOOLS = ["Read", "Grep", "Glob", "Edit", "Write", "Bash", "WebFetch", "WebSearch"];
const MODELS = [
  { value: "inherit", label: "Same as the session" },
  { value: "haiku", label: "Haiku (fast, low cost)" },
  { value: "sonnet", label: "Sonnet" },
  { value: "opus", label: "Opus (most capable)" },
];

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
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

export function NewItemPage() {
  const search = useSearch({ strict: false }) as { kind?: NewKind; scope?: string };
  const kind: NewKind = search.kind && search.kind in KINDS ? search.kind : "skill";
  const spec = KINDS[kind];
  const navigate = useNavigate();
  const qc = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/projects") });
  const [scope, setScope] = useState(search.scope ?? (spec.projectOnly ? "" : "global"));
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [manualOnly, setManualOnly] = useState(false);
  const [tools, setTools] = useState<string[]>([]);
  const [model, setModel] = useState("inherit");
  const [paths, setPaths] = useState("");
  const [keepCoding, setKeepCoding] = useState(true);
  const [guide, setGuide] = useState(spec.guides[0]!.slug);

  const create = useMutation({
    mutationFn: () =>
      api.post<{ path: string; check: { available: boolean; ok: boolean; output: string } | null }>("/library/new", {
        kind,
        scope,
        name,
        description,
        body,
        manualOnly,
        tools,
        model,
        paths: paths.split("\n"),
        keepCoding,
      }),
    onSuccess: () => {
      void qc.invalidateQueries();
      const hash = `#${spec.section}`;
      if (scope === "global") void navigate({ to: `/${spec.section === "rules" ? "instructions" : spec.section}` as "/skills" });
      else void navigate({ to: "/projects/$id", params: { id: scope }, search: {}, hash: hash.slice(1) });
    },
  });

  const scopes = [
    ...(spec.projectOnly ? [] : [{ value: "global", label: "All projects" }]),
    ...(projects.data ?? []).filter((p) => p.group === "root").map((p) => ({ value: p.id, label: p.name })),
  ];
  const nameOk = !spec.name || /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
  const ready = !!scope && nameOk && (!spec.name || !!name) && (!spec.description?.required || !!description.trim()) && (kind === "skill" || kind === "command" || kind === "agent" || kind === "output-style" || !!body.trim());

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-auto">
        <form
          className="mx-auto flex max-w-[760px] flex-col gap-5 px-6 py-8"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) create.mutate();
          }}
        >
          <div>
            <h1 className="text-[24px] font-semibold">{spec.title}</h1>
            <p className="mt-1 text-ink-2">{spec.intro}</p>
          </div>
          <Field label="Where it applies" htmlFor="scope">
            <SimpleSelect id="scope" label="Where it applies" value={scope} onChange={setScope} options={scopes} placeholder="Pick a project" />
          </Field>
          {spec.name && (
            <Field label="Name" hint={spec.name} htmlFor="name">
              <Input id="name" value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))} aria-invalid={!!name && !nameOk} maxLength={64} />
              {name && !nameOk && <p className="text-[13px] text-danger">Use only lowercase letters, numbers and single hyphens, not at the start or end.</p>}
            </Field>
          )}
          {spec.description && (
            <Field label={spec.description.label} hint={spec.description.hint} htmlFor="desc">
              <Textarea id="desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1024} />
              <p className="self-end text-[12px] text-muted-foreground">{description.length} of 1024</p>
            </Field>
          )}
          {kind === "skill" && (
            <label className="flex items-start gap-2.5 text-[14px]">
              <Checkbox checked={manualOnly} onCheckedChange={(v) => setManualOnly(v === true)} className="mt-0.5" />
              <span>
                Only when I type it
                <span className="block text-[13px] text-muted-foreground">Claude won't start it on its own. Use this for anything with side effects, such as deploying.</span>
              </span>
            </label>
          )}
          {kind === "agent" && (
            <>
              <Field label="Tools it can use" hint="Leave all unticked to give it the same tools as the session.">
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {TOOLS.map((t) => (
                    <label key={t} className="flex items-center gap-2 text-[14px]">
                      <Checkbox checked={tools.includes(t)} onCheckedChange={(v) => setTools(v === true ? [...tools, t] : tools.filter((x) => x !== t))} />
                      {t}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Model" htmlFor="model">
                <SimpleSelect id="model" label="Model" value={model} onChange={setModel} options={MODELS} />
              </Field>
            </>
          )}
          {kind === "rule" && (
            <Field label="Files it applies to" hint="One pattern per line, such as src/api/**/*.ts. Leave empty to apply to every file." htmlFor="paths">
              <Textarea id="paths" rows={3} value={paths} onChange={(e) => setPaths(e.target.value)} />
            </Field>
          )}
          {kind === "output-style" && (
            <label className="flex items-start gap-2.5 text-[14px]">
              <Checkbox checked={keepCoding} onCheckedChange={(v) => setKeepCoding(v === true)} className="mt-0.5" />
              <span>
                Keep Claude's coding instructions
                <span className="block text-[13px] text-muted-foreground">Leave this on if Claude will still write code while the style is on.</span>
              </span>
            </label>
          )}
          <Field label={spec.body.label} hint={spec.body.hint}>
            <div className="h-[360px] overflow-hidden rounded-md border border-input bg-surface">
              <MarkdownEditor value={body} onChange={setBody} path={`new-${kind}.md`} />
            </div>
          </Field>
          {create.error && <p className="text-[14px] text-danger">{(create.error as Error).message}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="lg" busy={create.isPending} disabled={!ready}>
              Create {spec.title.replace(/^New /, "")}
            </Button>
            <Button type="button" size="lg" variant="outline" onClick={() => history.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
      <aside aria-label="Guide" className="hidden w-[440px] flex-none flex-col border-l border-line bg-panel lg:flex">
        <div className="flex flex-wrap gap-1 border-b border-line p-2">
          {spec.guides.map((g) => (
            <button key={g.slug} type="button" onClick={() => setGuide(g.slug)} className={cn("rounded-md px-2.5 py-1.5 text-[13px]", guide === g.slug ? "bg-accent text-accent-foreground" : "text-ink-2 hover:bg-sunken")}>
              {g.label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4 text-[14px]">
          <GuideText slug={guide} />
        </div>
      </aside>
    </div>
  );
}
