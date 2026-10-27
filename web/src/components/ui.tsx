// App-level pieces composed from shadcn/ui components. The primitives themselves live in ./ui/.
import { ThemeProvider } from "next-themes";
import { useQueryClient } from "@tanstack/react-query";
import { Component, createContext, useCallback, useContext, useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkKbd } from "@/lib/kbd";
import { cn } from "@/lib/utils";
import type { Access } from "@/lib/types";
import { Alert, AlertDescription } from "./ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { Toaster } from "./ui/sonner";
import { Spinner } from "./ui/spinner";
import { TooltipProvider } from "./ui/tooltip";

export { cn };

export type Tone = "muted" | "ok" | "attn" | "accent" | "danger";
const TONE: Record<Tone, string> = {
  muted: "",
  ok: "bg-ok-soft text-ok",
  attn: "bg-attn-soft text-attn",
  accent: "bg-accent text-accent-foreground",
  danger: "",
};

/** A small status label: shadcn Badge with the app's status colours. */
export function Tag({ tone = "muted", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <Badge variant={tone === "danger" ? "destructive" : "secondary"} className={cn("rounded-md", TONE[tone], className)}>
      {children}
    </Badge>
  );
}

export function AccessTag({ access }: { access: Access }) {
  if (access === "edit") return <Tag tone="ok">Editable</Tag>;
  if (access === "app") return <Tag>Claude Code owns this</Tag>;
  if (access === "secret") return <Tag tone="danger">Secret, hidden</Tag>;
  return <Tag>Outside</Tag>;
}

/** A labelled on/off switch. */
export function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex min-h-9 items-center gap-2 rounded-md px-1.5 text-[13.5px] text-ink-2 hover:text-ink">
      <span className={cn("relative h-5 w-9 flex-none rounded-full border transition-colors", on ? "border-primary bg-primary" : "border-line-strong bg-sunken")}>
        <span className={cn("absolute top-0.5 size-3.5 rounded-full bg-surface shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
      </span>
      {label}
    </button>
  );
}

export function Dot({ tone }: { tone: "attn" | "ok" | "accent" | "muted" | "danger" }) {
  const c = { attn: "bg-attn-dot", ok: "bg-ok-dot", accent: "bg-primary", muted: "bg-faint", danger: "bg-destructive" }[tone];
  return <span aria-hidden className={cn("inline-block size-2 flex-none rounded-full", c)} />;
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 p-6 text-muted-foreground">
      <Spinner /> {label}…
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Empty className="items-start px-0 text-left">
      <EmptyHeader className="items-start text-left">
        <EmptyTitle>{title}</EmptyTitle>
        {children && <EmptyDescription>{children}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent className="items-start">{action}</EmptyContent>}
    </Empty>
  );
}

/** A failed request, in words, with a way to try again. */
export function ErrorNote({ error, onRetry, className = "m-4 w-auto" }: { error: unknown; onRetry?: () => void; className?: string }) {
  const qc = useQueryClient();
  if (!error) return null;
  const retry = onRetry ?? (() => void qc.refetchQueries({ type: "active" }));
  return (
    <Alert variant="destructive" className={className}>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span className="flex-1">{(error as Error).message || "Something went wrong."}</span>
        <Button size="sm" variant="outline" onClick={retry}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** Catches a page that fails while drawing, so the menu stays usable. */
export class PageErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-6 md:p-10">
        <div className="flex max-w-lg flex-col gap-3 rounded-lg border border-line bg-surface p-5">
          <h2 className="text-[17px] font-semibold">This page hit a problem</h2>
          <p className="text-ink-2">Something on this page failed while it was being shown. Your files weren't changed.</p>
          <div className="flex gap-2">
            <Button onClick={() => this.setState({ error: null })}>Try again</Button>
            <Button variant="outline" asChild>
              <a href="/" className="no-underline">Go home</a>
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

/** Dev only: ?crash=1 makes the page throw, to check the boundary above. */
export function CrashForTesting(): never {
  throw new Error("Test crash");
}

/** Headings one level per step deeper, so a document shown inside a section sits under the section's heading. */
const nestedHeadings = Object.fromEntries(
  ([1, 2, 3, 4, 5, 6] as const).map((n) => {
    const Tag = `h${Math.min(n + 2, 6)}` as "h3";
    return [`h${n}`, ({ children }: { children?: ReactNode }) => <Tag>{children}</Tag>];
  }),
);

export function Md({ children, className, nested }: { children: string; className?: string; nested?: boolean }) {
  return (
    <div className={cn("prose-cc", className)}>
      <Markdown remarkPlugins={[remarkGfm, remarkKbd]} components={{ ...(nested ? nestedHeadings : {}), a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a> }}>
        {children}
      </Markdown>
    </div>
  );
}

// ---- Confirmations (shadcn AlertDialog) ----

interface ConfirmOpts {
  title: string;
  body: ReactNode;
  confirm: string;
  danger?: boolean;
}
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function UiProvider({ children }: { children: ReactNode }) {
  const [confirm, setConfirm] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setConfirm({ ...o, resolve })), []);
  const close = (v: boolean) => {
    confirm?.resolve(v);
    setConfirm(null);
  };
  return (
    // next-themes renders an inline script for server-rendered pages. Here it would never run (theme-init.js does
    // that job), and React warns about any script element it renders, so it's marked as data instead.
    <ThemeProvider attribute="data-theme" storageKey="cc-theme" defaultTheme="system" enableSystem disableTransitionOnChange scriptProps={{ type: "application/json" }}>
      <TooltipProvider>
        <ConfirmCtx.Provider value={ask}>
          {children}
          <AlertDialog open={!!confirm} onOpenChange={(o) => !o && close(false)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
                <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => close(false)}>Cancel</AlertDialogCancel>
                <AlertDialogAction variant={confirm?.danger ? "destructive" : "default"} onClick={() => close(true)}>
                  {confirm?.confirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Toaster position="bottom-center" />
        </ConfirmCtx.Provider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
