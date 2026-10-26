// The box you type to Claude in. "/" at the start, or the / button, lists the slash commands the session accepts.
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { SlashCommand } from "@/lib/types";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { cn } from "./ui";

export function MessageBox({
  value,
  onChange,
  onSubmit,
  commands,
  placeholder,
  rows = 2,
  submitLabel = "Send",
  busy,
  disabled,
  enterSends = true,
  extra,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  commands: SlashCommand[];
  placeholder: string;
  rows?: number;
  submitLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  enterSends?: boolean;
  /** Shown after the send button, such as Stop. */
  extra?: ReactNode;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [forced, setForced] = useState(false);
  const [active, setActive] = useState(0);
  const typed = /^\/(\S*)$/.exec(value);
  const open = (forced || !!typed) && commands.length > 0;
  const filter = (typed?.[1] ?? "").toLowerCase();
  const shown = useMemo(
    () =>
      commands
        .filter((c) => !filter || c.name.toLowerCase().includes(filter))
        .sort((a, b) => Number(!a.name.toLowerCase().startsWith(filter)) - Number(!b.name.toLowerCase().startsWith(filter)))
        .slice(0, 50),
    [commands, filter],
  );
  const picked = /^\/(\S+)\s/.exec(value);
  const hint = picked ? commands.find((c) => c.name === picked[1])?.argumentHint : null;

  const pick = (c: SlashCommand) => {
    onChange(`/${c.name} `);
    setForced(false);
    setActive(0);
    ref.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && shown.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i + (e.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(shown[Math.min(active, shown.length - 1)]!);
        return;
      }
      if (e.key === "Escape") {
        setForced(false);
        if (typed) onChange("");
        return;
      }
    }
    if (e.key === "Enter" && (enterSends ? !e.shiftKey : e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (value.trim() && !disabled) onSubmit();
    }
  };

  return (
    <div className="relative flex flex-col gap-1.5">
      {open && (
        <ul role="listbox" aria-label="Slash commands" className="absolute bottom-full z-20 mb-2 max-h-72 w-full overflow-auto rounded-lg border border-line bg-popover p-1 shadow-[var(--shadow)]">
          {shown.length ? (
            shown.map((c, i) => (
              <li key={c.name} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(c)}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex w-full flex-col rounded-md px-3 py-2 text-left", i === active && "bg-accent text-accent-foreground")}
                >
                  <span className="truncate text-[14px] font-medium">
                    /{c.name} {c.argumentHint && <span className="font-normal text-muted-foreground">{c.argumentHint}</span>}
                  </span>
                  {c.description && <span className="line-clamp-2 text-[12.5px] text-muted-foreground">{c.description}</span>}
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-[13px] text-muted-foreground">No command starts with /{filter}.</li>
          )}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <Button type="button" variant="outline" size="lg" aria-label="Show slash commands" aria-expanded={open} onClick={() => (setForced(!open), ref.current?.focus())} disabled={!commands.length} title={commands.length ? "Slash commands" : "Commands appear once the session has started"}>
          /
        </Button>
        <Textarea
          ref={ref}
          rows={rows}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
          placeholder={hint ? `/${picked![1]} ${hint}` : placeholder}
          className="min-w-0 flex-1 resize-none text-[14.5px] leading-relaxed"
          aria-label="Message to Claude"
        />
        <Button size="lg" type="button" onClick={onSubmit} busy={busy} disabled={disabled || !value.trim()}>
          {submitLabel}
        </Button>
        {extra}
      </div>
      <p className="pl-14 text-[12px] text-muted-foreground">
        {enterSends ? "Enter to send · Shift+Enter for a new line" : "⌘Enter to send"} · / for commands{hint ? ` · this command takes: ${hint}` : ""}
      </p>
    </div>
  );
}
