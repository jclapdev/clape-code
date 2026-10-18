// Everything that applies in every project: what lives in ~/.claude and the plugins you've installed.
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { api } from "@/lib/api";
import type { LibraryItem } from "@/lib/types";
import { ErrorNote, Loading } from "@/components/ui";
import { ActionLink, ItemRows, MdFile, NewButton, Section, nameOf } from "./Projects";
import type { NewKind } from "./NewItem";

export function SetupPage() {
  const q = useQuery({ queryKey: ["library", "global"], queryFn: () => api.get<{ items: LibraryItem[] }>("/library?scope=global") });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const items = q.data!.items;
  const of = (k: LibraryItem["kind"]) => items.filter((i) => i.kind === k);
  const instructions = of("claude-md");
  const plugins = of("plugin");
  const slash = (i: LibraryItem) => `/${i.source === "plugin" ? `${i.sourceName}:` : ""}${nameOf(i)}`;
  const newButton = (kind: NewKind, label: string) => <NewButton kind={kind} scope="global" label={label} />;
  const sections: { id: string; title: string; count?: number; action?: ReactNode; node: ReactNode }[] = [
    {
      id: "instructions", action: newButton("instructions", "New instructions"),
      title: "CLAUDE.md",
      count: instructions.length,
      node: instructions.length ? <div className="flex flex-col gap-3">{instructions.map((i) => <MdFile key={i.path} path={i.path} />)}</div> : <p className="text-[13.5px] text-muted-foreground">You have no personal CLAUDE.md yet.</p>,
    },
    {
      id: "skills",
      title: "Skills",
      count: of("skill").length,
      action: newButton("skill", "New skill"),
      node: <ItemRows items={of("skill")} empty="No skills yet." usage={slash} />,
    },
    {
      id: "agents",
      title: "Agents",
      count: of("agent").length,
      action: newButton("agent", "New agent"),
      node: <ItemRows items={of("agent")} empty="No agents yet." />,
    },
    { id: "commands", action: newButton("command", "New command"), title: "Commands", count: of("command").length, node: <ItemRows items={of("command")} empty="No commands." usage={slash} /> },
    { id: "plugins", action: <ActionLink to="/live" search={{ new: "1", prompt: "Create a Claude Code plugin that " }} label="Have Claude make one" />, title: "Plugins", count: plugins.length, node: <ItemRows items={plugins} empty="No plugins installed." /> },
    { id: "hooks", action: <ActionLink to="/add" search={{ what: "hook", scope: "global" }} label="New hook" />, title: "Hooks", count: of("hook-def").length + of("hook").length, node: <ItemRows items={[...of("hook-def"), ...of("hook")]} empty="No hooks." /> },
    { id: "rules", action: newButton("rule", "New rule"), title: "Rules", count: of("rule").length, node: <ItemRows items={of("rule")} empty="No rules." /> },
    { id: "output-styles", action: newButton("output-style", "New style"), title: "Output styles", count: of("output-style").length, node: <ItemRows items={of("output-style")} empty="No output styles." /> },
    { id: "plans", title: "Plans", count: of("plan").length, node: <ItemRows items={of("plan")} empty="No plans yet." /> },
    { id: "settings", action: <span className="flex gap-2"><ActionLink to="/add" search={{ what: "permission", scope: "global" }} label="New permission rule" /><ActionLink to="/add" search={{ what: "mcp", scope: "global" }} label="Add MCP server" /></span>, title: "Settings files", count: of("settings").length, node: <ItemRows items={of("settings")} empty="No settings files." /> },
  ];
  return (
    <div className="h-full overflow-auto">
      <header className="border-b border-line px-6 py-5 md:px-12">
        <h1 className="text-[24px] font-semibold">Settings</h1>
        <p className="mt-1 text-muted-foreground">Applies to every project.</p>
      </header>
      <div className="flex gap-8 px-6 md:px-12">
        <div className="min-w-0 max-w-[900px] flex-1">
          {sections.map((s) => (
            <Section key={s.id} id={s.id} title={s.title} action={s.action}>
              {s.node}
            </Section>
          ))}
          <p className="flex flex-wrap gap-4 border-t border-line py-6 text-[14px]">
            <Link to="/map">File locations</Link>
            <Link to="/archive">Archived items</Link>
          </p>
        </div>
        <nav aria-label="On this page" className="sticky top-4 hidden h-fit w-48 flex-none py-6 xl:block">
          <ul className="flex flex-col gap-0.5 text-[13.5px]">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="flex justify-between rounded px-2 py-1 text-ink-2 no-underline hover:bg-sunken">
                  {s.title}
                  {s.count !== undefined && <span className="text-muted-foreground">{s.count}</span>}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
