// The project's board: BACKLOG.md's numbered table rows in Open, In spec and Done columns. Read-only.
import type { BoardColumn, ProjectDetail } from "@/lib/types";

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
  return (
    <section aria-label={`${col.name}, ${col.cards.length} ${col.cards.length === 1 ? "card" : "cards"}`} className="flex min-w-0 flex-col rounded-lg border border-line bg-sunken/60 p-2">
      <h3 className="flex items-baseline gap-2 px-1.5 pb-2 pt-1 text-[14px] font-semibold">
        {col.name}
        <span className="text-[12.5px] font-normal text-muted-foreground">{col.cards.length}</span>
      </h3>
      <ul className="flex flex-col gap-2">
        {col.cards.map((c) => (
          <li key={c.n} className="min-w-0 rounded-md border border-line bg-surface px-3 py-2 text-[13.5px]">
            <p className="line-clamp-2 break-words" title={c.idea}>
              <span className="text-muted-foreground">#{c.n}</span> {c.idea}
            </p>
            <p className="mt-1 break-words text-[12.5px] text-muted-foreground">{c.verdict}</p>
            {c.steps.length > 0 && (
              <ul className="mt-1.5 flex flex-col gap-1 text-[12.5px]">
                {c.steps.map((s) => (
                  <li key={s.id} className="break-words">
                    {s.id} {s.passing ? "passing" : "failing"}: {s.description}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
