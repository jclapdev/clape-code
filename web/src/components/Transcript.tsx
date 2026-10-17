import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { when } from "@/lib/format";
import type { Turn, TurnBlock } from "@/lib/types";
import { Md, cn } from "./ui";

type ToolBlock = Extract<TurnBlock, { kind: "tool" }>;

function ToolGroup({ tools }: { tools: ToolBlock[] }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const counts = new Map<string, number>();
  for (const t of tools) counts.set(t.name, (counts.get(t.name) ?? 0) + 1);
  const label = [...counts].map(([n, c]) => `${n}${c > 1 ? ` ×${c}` : ""}`).join(", ");
  const errors = tools.filter((t) => t.isError).length;
  return (
    <div className="rounded-md border border-line bg-sunken/50">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-9 w-full items-center gap-2 px-3 text-left text-[13px] text-ink-2">
        {open ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
        <span className="flex-1 truncate">
          {tools.length} tool {tools.length === 1 ? "call" : "calls"}: {label}
        </span>
        {errors > 0 && <span className="text-xs text-danger">{errors} failed</span>}
      </button>
      {open && (
        <ul className="border-t border-line">
          {tools.map((t) => (
            <li key={t.id} className="border-b border-line last:border-0">
              <button type="button" onClick={() => setDetail(detail === t.id ? null : t.id)} className="flex w-full items-baseline gap-3 px-3 py-1.5 text-left text-[12.5px] hover:bg-sunken">
                <span className={cn("w-20 flex-none font-medium", t.isError ? "text-danger" : "text-muted-foreground")}>{t.name}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-ink-2">{t.summary}</span>
              </button>
              {detail === t.id && (
                <div className="space-y-2 px-3 pb-3">
                  <pre className="max-h-60 overflow-auto rounded bg-surface p-2 font-mono text-[12px] text-ink-2">{JSON.stringify(t.input, null, 2)}</pre>
                  {t.result !== undefined && <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-surface p-2 font-mono text-[12px] text-ink-2">{t.result || "(no output)"}</pre>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Assistant blocks with consecutive tool calls folded into one collapsed row. */
function AssistantBlocks({ blocks, showThinking }: { blocks: TurnBlock[]; showThinking: boolean }) {
  const out: React.ReactNode[] = [];
  let run: ToolBlock[] = [];
  const flush = (k: string) => {
    if (run.length) out.push(<ToolGroup key={k} tools={run} />);
    run = [];
  };
  blocks.forEach((b, i) => {
    if (b.kind === "tool") return void run.push(b);
    if (b.kind === "thinking" && !showThinking) return;
    flush(`t${i}`);
    if (b.kind === "text") out.push(<Md key={i}>{b.text}</Md>);
    else if (showThinking) out.push(<div key={i} className="border-l-2 border-line pl-3 text-[13px] italic text-muted-foreground">{b.text}</div>);
  });
  flush("end");
  return <div className="flex flex-col gap-3">{out}</div>;
}

export function Transcript({ turns, mineOnly, showThinking = false }: { turns: Turn[]; mineOnly?: boolean; showThinking?: boolean }) {
  const shown = mineOnly ? turns.filter((t) => t.role === "user") : turns;
  if (!shown.length) return <p className="text-muted-foreground">This session has no messages yet.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {shown.map((t, i) => (
        <li key={t.uuid ?? i} id={t.role === "user" ? `prompt-${i}` : undefined} data-prompt={t.role === "user" ? "" : undefined}>
          {t.role === "system" ? (
            <div className="py-1 text-center text-xs text-muted-foreground">{(t.blocks[0] as any)?.text}</div>
          ) : (
            <article className={cn("rounded-lg border px-4 py-3", t.role === "user" ? "border-primary-line bg-accent/40" : "border-line bg-surface")}>
              <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                <span className={cn("font-semibold", t.role === "user" ? "text-accent-foreground" : "text-ink-2")}>{t.role === "user" ? "You" : "Claude"}</span>
                <span className="text-muted-foreground">{when(t.at)}</span>
              </div>
              {t.role === "user" ? <div className="whitespace-pre-wrap text-[14px] leading-relaxed">{(t.blocks[0] as any)?.text}</div> : <AssistantBlocks blocks={t.blocks} showThinking={showThinking} />}
            </article>
          )}
        </li>
      ))}
    </ol>
  );
}
