import { ChevronLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { layoutStorage, useMediaQuery } from "@/lib/prefs";
import { IconButton } from "./IconButton";

// The page registers its list pane here so the `]` shortcut and the header buttons can toggle it.
interface PaneApi {
  toggleList: () => void;
}
const PaneRegistry = createContext<{ set: (api: PaneApi | null) => void; get: () => PaneApi | null }>({ set: () => {}, get: () => null });
export const usePaneRegistry = () => useContext(PaneRegistry);

export function PaneRegistryProvider({ children }: { children: ReactNode }) {
  const ref = useRef<PaneApi | null>(null);
  const value = useRef({ set: (api: PaneApi | null) => (ref.current = api), get: () => ref.current }).current;
  return <PaneRegistry.Provider value={value}>{children}</PaneRegistry.Provider>;
}

export const useIsMobile = () => useMediaQuery("(max-width: 767px)");

/**
 * List + detail, resizable and collapsible on wide screens, one at a time on phones.
 * `hasSelection` decides which one a phone shows.
 */
export function TwoPane({ id, list, detail, hasSelection, onBack, listLabel }: { id: string; list: ReactNode; detail: ReactNode; hasSelection: boolean; onBack?: () => void; listLabel: string }) {
  const mobile = useIsMobile();
  const panel = usePanelRef();
  const reg = usePaneRegistry();
  const [collapsed, setCollapsed] = useState(false);
  const layout = useDefaultLayout({ id: `cc-pane-${id}`, storage: layoutStorage });

  const toggle = useCallback(() => {
    const p = panel.current;
    if (!p) return;
    if (p.isCollapsed()) p.expand();
    else p.collapse();
  }, [panel]);

  useEffect(() => {
    reg.set({ toggleList: toggle });
    return () => reg.set(null);
  }, [reg, toggle]);

  if (mobile) {
    if (!hasSelection) return <section aria-label={listLabel} className="h-full overflow-auto">{list}</section>;
    return (
      <div className="flex h-full flex-col">
        {onBack && (
          <button type="button" onClick={onBack} className="flex h-11 flex-none items-center gap-1 border-b border-line px-3 text-left text-[13.5px] text-primary">
            <ChevronLeft className="size-4" aria-hidden /> {listLabel}
          </button>
        )}
        <div className="min-h-0 flex-1 overflow-auto">{detail}</div>
      </div>
    );
  }

  return (
    <Group orientation="horizontal" defaultLayout={layout.defaultLayout} onLayoutChanged={layout.onLayoutChanged} className="h-full">
      <Panel
        id="list"
        panelRef={panel}
        collapsible
        collapsedSize={0}
        minSize={220}
        defaultSize={320}
        maxSize="55%"
        onResize={() => setCollapsed(!!panel.current?.isCollapsed())}
      >
        <section aria-label={listLabel} className="h-full overflow-auto bg-panel">
          {list}
        </section>
      </Panel>
      <Separator aria-label={`Resize ${listLabel.toLowerCase()}`} />
      <Panel id="detail" minSize={360}>
        <div className="relative flex h-full flex-col">
          <div className="absolute left-2 top-2 z-10">
            <IconButton label={collapsed ? `Show ${listLabel.toLowerCase()} (])` : `Hide ${listLabel.toLowerCase()} (])`} onClick={toggle}>
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">{detail}</div>
        </div>
      </Panel>
    </Group>
  );
}

/** Standard header for a detail pane; leaves room for the pane toggle on the left. */
export function DetailHeader({ title, sub, actions, children }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 border-b border-line px-6 pb-4 pt-4 md:pl-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[20px] font-semibold tracking-[-0.01em]">{title}</h1>
          {sub && <div className="mt-1 text-[13px] text-muted-foreground">{sub}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** A page with no list pane. */
export function Page({ title, sub, actions, children, wide }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className="h-full overflow-auto">
      <div className={wide ? "mx-auto max-w-[1400px] px-4 py-6 md:px-8" : "mx-auto max-w-[1180px] px-4 py-6 md:px-8"}>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[24px] font-semibold tracking-[-0.01em]">{title}</h1>
            {sub && <p className="mt-1 text-muted-foreground">{sub}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
        {children}
      </div>
    </div>
  );
}

/** Group heading inside a list pane. */
export function ListGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="px-2 pb-2">
      <div className="px-2.5 pb-1 pt-3 text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
