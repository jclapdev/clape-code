// The project's board: BACKLOG.md's numbered table rows in Open, In spec and Done columns. Read-only.
import { Tag } from "@/components/ui";
import type { BoardCard, BoardColumn, ProjectDetail } from "@/lib/types";

export function ProjectBoard({ p }: { p: ProjectDetail }) {
  return (
    <div className="grid min-w-0 gap-3 md:grid-cols-3" role="group" aria-label="Board">
      {p.board.columns.map((c) => (
        <Column key={c.key} col={c} />
      ))}
    </div>
  );
}

function Column({ col }: { col: BoardColumn }) {
  const n = col.cards.length;
  return (
    <section aria-labelledby={`board-${col.key}`} className="flex min-w-0 flex-col rounded-lg border border-line bg-sunken/60 p-2">
      <h3 id={`board-${col.key}`} className="flex items-baseline gap-2 px-1.5 pb-2 pt-1 text-[14px] font-semibold">
        {col.name}
        <span className="text-[12.5px] font-normal tabular-nums text-muted-foreground" aria-label={`${n} ${n === 1 ? "card" : "cards"}`}>
          {n}
        </span>
      </h3>
      {n === 0 ? (
        <p className="px-1.5 pb-1 text-[13px] text-muted-foreground">None</p>
      ) : (
        <ul className="flex max-h-[32rem] min-w-0 flex-col gap-2 overflow-y-auto overflow-x-hidden md:max-h-[70vh]">
          {col.cards.map((c) => (
            <Card key={c.n} c={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Card({ c }: { c: BoardCard }) {
  return (
    <li className="min-w-0 rounded-md border border-line bg-surface px-3 py-2 text-[13.5px]">
      <p className="line-clamp-2 break-words" title={c.idea}>
        <span className="whitespace-nowrap font-semibold tabular-nums text-muted-foreground">#{c.n}</span> {c.idea}
      </p>
      {c.verdict && <p className="mt-1 break-words text-[12.5px] text-muted-foreground">{c.verdict}</p>}
      {c.steps.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5 border-t border-line pt-2 text-[12.5px]">
          {c.steps.map((s) => (
            <li key={s.id} className="flex min-w-0 items-start gap-2">
              <Tag tone={s.passing ? "ok" : "attn"} className="mt-px">
                {s.passing ? "Passing" : "Failing"}
              </Tag>
              <span className="min-w-0 break-words">
                <span className="font-medium">{s.id}</span> <span className="text-ink-2">{s.description}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
