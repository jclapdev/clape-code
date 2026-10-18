import { useQuery } from "@tanstack/react-query";
import { Kbd } from "./ui/kbd";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Archive,
  Briefcase,
  FolderKanban,
  History,
  Home,
  Library,
  Map as MapIcon,
  Menu,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Search,
  Settings2,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { api } from "@/lib/api";
import { useLiveUpdates, useWaiting } from "@/lib/live";
import { useTheme } from "next-themes";
import { layoutStorage } from "@/lib/prefs";
import { CommandPalette } from "./CommandPalette";
import { IconButton } from "./IconButton";
import { LoginGate } from "./LoginGate";
import { useIsMobile, usePaneRegistry } from "./Panes";
import { cn } from "./ui";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { Button } from "./ui/button";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  count?: number;
  attn?: number;
  key: string;
}

function useNavItems(): NavItem[] {
  const waiting = useWaiting();
  const overview = useQuery({ queryKey: ["overview"], queryFn: () => api.get<any>("/overview") });
  const blocked = overview.data?.jobCounts?.blocked ?? 0;
  return [
    { to: "/", label: "Home", icon: Home, attn: (overview.data?.needsYou?.length ?? 0) || undefined, key: "h" },
    { to: "/projects", label: "Projects", icon: FolderKanban, key: "p" },
    { to: "/sessions", label: "Sessions", icon: History, key: "s" },
    { to: "/live", label: "Live", icon: Radio, attn: waiting || undefined, key: "l" },
    { to: "/jobs", label: "Jobs", icon: Briefcase, attn: blocked || undefined, key: "j" },
    { to: "/library", label: "Library", icon: Library, key: "i" },
    { to: "/settings", label: "Settings", icon: Settings2, key: "t" },
    { to: "/map", label: "Map", icon: MapIcon, key: "m" },
    { to: "/archive", label: "Archive", icon: Archive, key: "a" },
  ];
}

function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  return (
    <ToggleGroup type="single" variant="outline" size="sm" value={theme ?? "system"} onValueChange={(v) => v && setTheme(v)} aria-label="Theme">
      <ToggleGroupItem value="system" aria-label="Match system" title="Match system">
        <Monitor />
      </ToggleGroupItem>
      <ToggleGroupItem value="light" aria-label="Light" title="Light">
        <Sun />
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" aria-label="Dark" title="Dark">
        <Moon />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function NavList({ items, collapsed, onPick }: { items: NavItem[]; collapsed: boolean; onPick?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items.map((it) => {
        const on = it.to === "/" ? path === "/" : path.startsWith(it.to);
        const Icon = it.icon;
        return (
          <Link
            key={it.to}
            to={it.to}
            onClick={onPick}
            title={collapsed ? it.label : undefined}
            aria-current={on ? "page" : undefined}
            className={cn(
              "relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[14px] text-ink-2 no-underline hover:bg-sunken hover:text-ink",
              on && "bg-accent font-semibold text-accent-foreground hover:bg-accent hover:text-accent-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            <Icon className="size-4 flex-none" aria-hidden />
            {!collapsed && <span className="flex-1 truncate">{it.label}</span>}
            {it.attn ? (
              <span
                className={cn("rounded-full bg-attn-dot font-semibold text-white", collapsed ? "absolute right-1.5 top-1.5 size-2" : "px-1.5 text-[11px]")}
                aria-label={`${it.attn} need you`}
              >
                {!collapsed && it.attn}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function NavBody({ collapsed, onToggle, onPick, onSearch, connected }: { collapsed: boolean; onToggle?: () => void; onPick?: () => void; onSearch: () => void; connected: boolean }) {
  const items = useNavItems();
  return (
    <div className={cn("flex h-full flex-col gap-2 bg-panel py-3", collapsed ? "px-2" : "px-3")}>
      <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between pl-1.5")}>
        {!collapsed && (
          <Link to="/" className="flex items-center gap-2 text-ink no-underline" onClick={onPick}>
            <img src="/favicon.svg" alt="" className="size-6 rounded-md dark:ring-1 dark:ring-white/25" />
            <span className="text-[14px] font-semibold">Control Center</span>
          </Link>
        )}
        {onToggle && (
          <IconButton label={collapsed ? "Expand menu ([)" : "Collapse menu ([)"} onClick={onToggle} className="text-muted-foreground">
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </IconButton>
        )}
      </div>
      <Button variant="outline" size="lg" onClick={onSearch} title="Search (⌘K)" aria-label="Search" className={cn("mb-1 text-muted-foreground", collapsed ? "justify-center px-0" : "justify-start")}>
        <Search aria-hidden />
        {!collapsed && (
          <>
            <span className="flex-1 text-left font-normal">Search…</span>
            <Kbd>⌘K</Kbd>
          </>
        )}
      </Button>
      <NavList items={items} collapsed={collapsed} onPick={onPick} />
      <div className={cn("mt-auto flex flex-col gap-2 pt-3", collapsed && "items-center")}>
        <Link
          to="/preferences"
          onClick={onPick}
          title="Preferences"
          className={cn("flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[14px] text-ink-2 no-underline hover:bg-sunken hover:text-ink", collapsed && "justify-center px-0")}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          {!collapsed && "Preferences"}
        </Link>
        {!collapsed && <ThemeSwitch />}
        <div className={cn("flex items-center gap-2 px-1 text-xs text-muted-foreground", collapsed && "justify-center")} title={connected ? "Live: watching your files" : "Reconnecting…"}>
          <span className={cn("size-2 rounded-full", connected ? "bg-ok-dot" : "bg-attn-dot")} aria-hidden />
          {!collapsed && (connected ? "Watching your files" : "Reconnecting…")}
        </div>
      </div>
    </div>
  );
}

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || !!el.closest(".cm-editor"));
};

export function Shell() {
  const connected = useLiveUpdates();
  const mobile = useIsMobile();
  const nav = usePanelRef();
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const layout = useDefaultLayout({ id: "cc-shell", storage: layoutStorage });
  const reg = usePaneRegistry();
  const navigate = useNavigate();
  const items = useNavItems();
  const gPressed = useRef(0);
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    const view = path.split("/")[1] || "home";
    api.post("/metrics/view", { view }).catch(() => {});
  }, [path]);

  const toggleNav = () => {
    const p = nav.current;
    if (!p) return;
    if (p.isCollapsed()) p.expand();
    else p.collapse();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "[") return toggleNav();
      if (e.key === "]") return reg.get()?.toggleList();
      if (e.key === "/") {
        e.preventDefault();
        (document.querySelector("[data-filter]") as HTMLInputElement | null)?.focus();
        return;
      }
      if (e.key === "e") {
        const editor = document.querySelector<HTMLElement>(".cm-content[contenteditable=true]");
        if (editor) {
          e.preventDefault();
          editor.focus();
        }
        return;
      }
      if (e.key === "g") {
        gPressed.current = Date.now();
        return;
      }
      if (Date.now() - gPressed.current < 1200) {
        const it = items.find((i) => i.key === e.key);
        gPressed.current = 0;
        if (it) navigate({ to: it.to });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (mobile) {
    return (
      <LoginGate>
        <div className="flex h-full flex-col">
          <div className="flex h-12 flex-none items-center justify-between border-b border-line bg-panel px-2">
            <IconButton label="Open menu" size="icon-lg" onClick={() => setDrawer(true)}>
              <Menu />
            </IconButton>
            <Link to="/" className="flex items-center gap-2 font-semibold text-ink no-underline">
              <img src="/favicon.svg" alt="" className="size-5 rounded-md dark:ring-1 dark:ring-white/25" /> Control Center
            </Link>
            <IconButton label="Search" size="icon-lg" onClick={() => setPaletteOpen(true)}>
              <Search />
            </IconButton>
          </div>
          <main className="min-h-0 flex-1">
            <Outlet />
          </main>
          <Dialog open={drawer} onOpenChange={setDrawer}>
            <DialogContent className="h-[80vh] overflow-hidden p-0">
              <DialogTitle className="sr-only">Menu</DialogTitle>
              <NavBody collapsed={false} onPick={() => setDrawer(false)} onSearch={() => (setDrawer(false), setPaletteOpen(true))} connected={connected} />
            </DialogContent>
          </Dialog>
          <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onToggleNav={toggleNav} />
        </div>
      </LoginGate>
    );
  }

  return (
    <LoginGate>
      <Group orientation="horizontal" defaultLayout={layout.defaultLayout} onLayoutChanged={layout.onLayoutChanged} className="h-full">
        <Panel id="nav" panelRef={nav} collapsible collapsedSize={56} minSize={190} defaultSize={224} maxSize={320} onResize={() => setNavCollapsed(!!nav.current?.isCollapsed())}>
          <NavBody collapsed={navCollapsed} onToggle={toggleNav} onSearch={() => setPaletteOpen(true)} connected={connected} />
        </Panel>
        <Separator aria-label="Resize menu" />
        <Panel id="main" minSize={480}>
          <main className="h-full">
            <Outlet />
          </main>
        </Panel>
      </Group>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onToggleNav={toggleNav} />
    </LoginGate>
  );
}
