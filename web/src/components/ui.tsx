import { clsx, type ClassValue } from "clsx";
import { Loader2, X } from "lucide-react";
import { createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { twMerge } from "tailwind-merge";
import type { Access } from "@/lib/types";

export const cn = (...c: ClassValue[]) => twMerge(clsx(c));

type Variant = "default" | "primary" | "ghost" | "danger" | "attn";
const VARIANTS: Record<Variant, string> = {
  default: "border-line-strong bg-surface text-ink hover:bg-sunken",
  primary: "border-accent bg-accent text-on-accent hover:bg-accent-strong hover:border-accent-strong",
  ghost: "border-transparent bg-transparent text-ink-2 hover:bg-sunken hover:text-ink",
  danger: "border-danger-line bg-surface text-danger hover:bg-danger-soft",
  attn: "border-attn-line bg-attn-soft text-attn hover:brightness-95",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; busy?: boolean }>(
  ({ variant = "default", size = "md", busy, className, children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      disabled={disabled || busy}
      className={cn(
        "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5 text-[13.5px]",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cn("inline-grid size-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink", className)} {...rest}>
      {children}
    </button>
  );
}

export function Dot({ tone }: { tone: "attn" | "ok" | "accent" | "muted" | "danger" }) {
  const c = { attn: "bg-attn-dot", ok: "bg-ok-dot", accent: "bg-accent", muted: "bg-faint", danger: "bg-danger" }[tone];
  return <span aria-hidden className={cn("inline-block size-2 flex-none rounded-full", c)} />;
}

export function Tag({ tone = "muted", children, className }: { tone?: "muted" | "ok" | "attn" | "accent" | "danger"; children: ReactNode; className?: string }) {
  const c = {
    muted: "bg-sunken text-ink-2",
    ok: "bg-ok-soft text-ok",
    attn: "bg-attn-soft text-attn",
    accent: "bg-accent-soft text-accent-strong",
    danger: "bg-danger-soft text-danger",
  }[tone];
  return <span className={cn("inline-flex h-[22px] items-center whitespace-nowrap rounded px-1.5 text-xs font-medium", c, className)}>{children}</span>;
}

export function AccessTag({ access }: { access: Access }) {
  if (access === "edit") return <Tag tone="ok">Editable</Tag>;
  if (access === "app") return <Tag>Claude Code owns this</Tag>;
  if (access === "secret") return <Tag tone="danger">Secret, hidden</Tag>;
  return <Tag>Outside</Tag>;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 p-6 text-muted">
      <Loader2 className="size-4 animate-spin" aria-hidden /> {label}…
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 p-8">
      <div className="text-[15px] font-semibold">{title}</div>
      {children && <div className="max-w-prose text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <div className="m-4 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-danger">{(error as Error).message ?? String(error)}</div>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-b-2 border-line-strong bg-surface px-1.5 py-px font-mono text-[11px] text-ink-2">{children}</kbd>;
}

export function Md({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("prose-cc", className)}>
      <Markdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a> }}>
        {children}
      </Markdown>
    </div>
  );
}

/** Native <dialog>: focus trapping, Escape and the backdrop come from the browser. */
export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn(
        "m-auto max-h-[88vh] w-[calc(100%-32px)] overflow-hidden rounded-xl border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-black/40",
        wide ? "max-w-5xl" : "max-w-lg",
      )}
    >
      {open && (
        <div className="flex max-h-[88vh] flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            <IconButton label="Close" onClick={onClose}>
              <X className="size-4" />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

// ---- Confirmations ----

interface ConfirmOpts {
  title: string;
  body: ReactNode;
  confirm: string;
  danger?: boolean;
}
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

// ---- Toasts ----

interface Toast {
  id: number;
  text: string;
  tone: "ok" | "danger";
  action?: { label: string; run: () => void };
}
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function UiProvider({ children }: { children: ReactNode }) {
  const [confirm, setConfirm] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setConfirm({ ...o, resolve })), []);
  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.action ? 8000 : 4000);
  }, []);
  const close = (v: boolean) => {
    confirm?.resolve(v);
    setConfirm(null);
  };
  return (
    <ConfirmCtx.Provider value={ask}>
      <ToastCtx.Provider value={toast}>
        {children}
        <Dialog
          open={!!confirm}
          onClose={() => close(false)}
          title={confirm?.title ?? ""}
          footer={
            <>
              <Button onClick={() => close(false)}>Cancel</Button>
              <Button variant={confirm?.danger ? "danger" : "primary"} onClick={() => close(true)} autoFocus>
                {confirm?.confirm}
              </Button>
            </>
          }
        >
          <div className="text-ink-2">{confirm?.body}</div>
        </Dialog>
        <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-[min(520px,calc(100%-32px))] -translate-x-1/2 flex-col gap-2">
          {toasts.map((t) => (
            <div key={t.id} className={cn("pointer-events-auto flex items-center justify-between gap-3 rounded-lg border bg-surface px-4 py-2.5 shadow-pop", t.tone === "danger" ? "border-danger-line text-danger" : "border-line text-ink")}>
              <span>{t.text}</span>
              {t.action && (
                <Button size="sm" variant="ghost" onClick={t.action.run}>
                  {t.action.label}
                </Button>
              )}
            </div>
          ))}
        </div>
      </ToastCtx.Provider>
    </ConfirmCtx.Provider>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-sunken p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          aria-label={o.title}
          onClick={() => onChange(o.value)}
          className={cn("inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded px-2 text-[12.5px] text-muted", value === o.value && "bg-surface text-ink shadow-sm")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
