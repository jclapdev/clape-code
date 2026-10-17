// App-level pieces composed from shadcn/ui components. The primitives themselves live in ./ui/.
import { ThemeProvider } from "next-themes";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
    <Empty className="items-start text-left md:pl-12">
      <EmptyHeader className="items-start text-left">
        <EmptyTitle>{title}</EmptyTitle>
        {children && <EmptyDescription>{children}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent className="items-start">{action}</EmptyContent>}
    </Empty>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Alert variant="destructive" className="m-4 w-auto">
      <AlertDescription>{(error as Error).message ?? String(error)}</AlertDescription>
    </Alert>
  );
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
    <ThemeProvider attribute="data-theme" storageKey="cc-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
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
