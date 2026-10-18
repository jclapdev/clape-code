// The project's board: PROGRESS.md's Next, In progress and Done sections as columns.
// Phones show one column at a time with tabs and move cards through each card's menu.
// From 768 px the columns sit side by side and scroll sideways inside the board; from 1280 px all three fit.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type DragEvent, type FormEvent } from "react";
import { toast } from "sonner";
import { api, ApiError, enc } from "@/lib/api";
import type { BoardCard, BoardColumn, ColumnKey, ProjectDetail } from "@/lib/types";
import { useIsMobile } from "@/components/Panes";
import { Md, Tag, cn, useConfirm } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const EMPTY: BoardColumn[] = [
  { key: "next", name: "Next", line: null, cards: [] },
  { key: "progress", name: "In progress", line: null, cards: [] },
  { key: "done", name: "Done", line: null, cards: [] },
];

const EMPTY_TEXT: Record<ColumnKey, string> = {
  next: "Nothing waiting. Add what should happen next.",
  progress: "Nothing in progress. Drag a card here when work starts.",
  done: "Nothing finished yet.",
};

type Op = { op: "add"; column: ColumnKey; text: string } | { op: "edit"; line: number; text: string } | { op: "move"; line: number; to: ColumnKey } | { op: "delete"; line: number };

function useBoardOps(p: ProjectDetail) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ op, ...body }: Op) => api.post(`/projects/${enc(p.id)}/board/${op}`, { ...body, hash: p.board!.hash }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["project", p.id] }),
    onError: (e: Error) => toast.error(e instanceof ApiError && e.status === 409 ? "PROGRESS.md changed on disk. The board has been reloaded; try again." : e.message),
  });
}

export function ProjectBoard({ p }: { p: ProjectDetail }) {
  const qc = useQueryClient();
  const phone = useIsMobile();
  const [tab, setTab] = useState<ColumnKey>("next");
  const ops = useBoardOps(p);
  const start = useMutation({
    mutationFn: () => api.post(`/projects/${enc(p.id)}/board/start`),
    onSuccess: () => {
      toast.success("Made PROGRESS.md with empty Next, In progress and Done lists.");
      qc.invalidateQueries({ queryKey: ["project", p.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns = p.board?.columns ?? EMPTY;
  const busy = ops.isPending;

  if (!p.board) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-line-strong bg-surface px-4 py-5">
        <p className="text-ink-2">
          This project has no board yet. Starting one makes a PROGRESS.md with empty Next, In progress and Done lists, which you and Claude both keep up to date.
        </p>
        <div>
          <Button onClick={() => start.mutate()} busy={start.isPending}>
            Start a board
          </Button>
        </div>
      </div>
    );
  }

  const column = (c: BoardColumn) => <Column key={c.key} col={c} columns={columns} phone={phone} busy={busy} run={ops.mutate} />;

  return (
    <div className="flex flex-col gap-3">
      {phone ? (
        <>
          <div role="tablist" aria-label="Board columns" className="grid grid-cols-3 gap-1 rounded-lg bg-sunken p-1">
            {columns.map((c) => (
              <button
                key={c.key}
                role="tab"
                type="button"
                aria-selected={tab === c.key}
                onClick={() => setTab(c.key)}
                className={cn("min-w-0 rounded-md px-2 py-1.5 text-[13px] font-medium text-muted-foreground", tab === c.key && "bg-surface text-ink shadow-sm")}
              >
                <span className="truncate">{c.name}</span> <span className="text-muted-foreground">{c.cards.length}</span>
              </button>
            ))}
          </div>
          {column(columns.find((c) => c.key === tab)!)}
        </>
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 xl:grid xl:grid-cols-3 xl:overflow-x-visible" role="group" aria-label="Board">
          {columns.map(column)}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        From {p.board.path.split(/[\\/]/).pop()}: only its Next, In progress and Done sections show here, and a change edits only the lines of the card you touch.{" "}
        <Link to="/file" search={{ path: p.board.path }}>
          Edit as text
        </Link>
      </p>
    </div>
  );
}

function Column({ col, columns, phone, busy, run }: { col: BoardColumn; columns: BoardColumn[]; phone: boolean; busy: boolean; run: (op: Op) => void }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [over, setOver] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const raw = e.dataTransfer.getData("application/x-cc-card");
    if (!raw) return;
    const { line, from } = JSON.parse(raw) as { line: number; from: ColumnKey };
    if (from !== col.key && !busy) run({ op: "move", line, to: col.key });
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    run({ op: "add", column: col.key, text: draft });
    setDraft("");
    setAdding(false);
  };

  return (
    <section
      aria-label={`${col.name}, ${col.cards.length} ${col.cards.length === 1 ? "card" : "cards"}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("application/x-cc-card")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={onDrop}
      className={cn("flex min-w-0 flex-col rounded-lg border border-line bg-sunken/60 p-2", !phone && "w-[300px] flex-none xl:w-auto", over && "border-primary bg-accent")}
    >
      {!phone && (
        <h3 className="flex items-baseline gap-2 px-1.5 pb-2 pt-1 text-[14px] font-semibold">
          {col.name}
          <span className="text-[12.5px] font-normal text-muted-foreground">{col.cards.length}</span>
        </h3>
      )}
      <ul className="flex flex-col gap-2">
        {col.cards.map((c) => (
          <CardView key={c.line} card={c} col={col} columns={columns} phone={phone} busy={busy} run={run} />
        ))}
      </ul>
      {!col.cards.length && !adding && <p className="px-1.5 py-2 text-[13px] text-muted-foreground">{EMPTY_TEXT[col.key]}</p>}
      {adding ? (
        <form onSubmit={add} className="mt-2 flex flex-col gap-2">
          <Textarea
            autoFocus
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setAdding(false);
              if (e.key === "Enter" && !e.shiftKey) add(e);
            }}
            placeholder="What needs doing? End with #label to tag it."
            aria-label={`New card in ${col.name}`}
            className="resize-y bg-surface"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!draft.trim()}>
              Add card
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="ghost" size="sm" className="mt-1 justify-start text-muted-foreground" onClick={() => setAdding(true)} disabled={busy}>
          <Plus aria-hidden /> Add a card
        </Button>
      )}
    </section>
  );
}

function CardView({ card, col, columns, phone, busy, run }: { card: BoardCard; col: BoardColumn; columns: BoardColumn[]; phone: boolean; busy: boolean; run: (op: Op) => void }) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.text);
  const [open, setOpen] = useState(false);
  const others = columns.filter((c) => c.key !== col.key);

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (draft.trim() && draft.trim() !== card.text) run({ op: "edit", line: card.line, text: draft });
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="rounded-md border border-line bg-surface p-2">
        <form onSubmit={save} className="flex flex-col gap-2">
          <Textarea
            autoFocus
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
              if (e.key === "Enter" && !e.shiftKey) save(e);
            }}
            aria-label="Card text"
            className="resize-y"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li
      draggable={!phone && !busy}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-cc-card", JSON.stringify({ line: card.line, from: col.key }));
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn("group flex gap-1 rounded-md border border-line bg-surface py-2 pl-3 pr-1 shadow-xs", !phone && "cursor-grab active:cursor-grabbing", busy && "opacity-70")}
    >
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="block w-full text-left text-[13.5px] leading-relaxed">
          <Md className={cn("break-words [&_p]:m-0", !open && "line-clamp-4", col.key === "done" && "text-ink-2")}>{(card.n !== null ? `${card.n}. ` : "") + card.title}</Md>
        </button>
        {card.labels.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {card.labels.map((l) => (
              <Tag key={l}>#{l}</Tag>
            ))}
          </div>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Card actions" className="flex-none text-muted-foreground" disabled={busy}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setDraft(card.text);
              setEditing(true);
            }}
          >
            <Pencil aria-hidden /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Move to…</DropdownMenuLabel>
          {others.map((o) => (
            <DropdownMenuItem key={o.key} onSelect={() => run({ op: "move", line: card.line, to: o.key })}>
              <ArrowRight aria-hidden /> {o.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={async () => {
              if (await confirm({ title: "Delete this card?", body: "It's taken out of PROGRESS.md. The previous version of the file is kept as a backup.", confirm: "Delete", danger: true })) run({ op: "delete", line: card.line });
            }}
          >
            <Trash2 aria-hidden /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
