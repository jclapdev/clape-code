import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { BookOpen, ChevronRight, Globe, Home, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, SlidersHorizontal, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { api } from "@/lib/api";
import { setPageTitle, useLiveUpdates, useWaiting } from "@/lib/live";
import type { Project } from "@/lib/types";
import { useTheme } from "next-themes";
import { layoutStorage } from "@/lib/prefs";
import { IconButton } from "./IconButton";
import { LoginGate } from "./LoginGate";
import { SearchBox } from "./SearchBox";
import { useIsMobile } from "./Panes";
import { cn, CrashForTesting, PageErrorBoundary } from "./ui";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

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

const itemClass = (on: boolean, collapsed: boolean) =>
  cn(
    "relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[14px] text-ink-2 no-underline hover:bg-sunken hover:text-ink",
    on && "bg-accent font-semibold text-accent-foreground hover:bg-accent hover:text-accent-foreground",
    collapsed && "justify-center px-0",
  );

function TopLink({ to, label, icon: Icon, attn, collapsed, onPick }: { to: string; label: string; icon: typeof Home; attn?: number; collapsed: boolean; onPick?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const on = to === "/" ? path === "/" : path.startsWith(to);
  return (
    <Link to={to} onClick={onPick} title={collapsed ? label : undefined} aria-current={on ? "page" : undefined} className={itemClass(on, collapsed)}>
      <Icon className="size-4 flex-none" aria-hidden />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {attn ? (
        <span className={cn("rounded-full bg-attn-dot font-semibold text-white", collapsed ? "absolute right-1.5 top-1.5 size-2" : "px-1.5 text-[11px]")} aria-label={`${attn} need you`}>
          {!collapsed && attn}
        </span>
      ) : null}
    </Link>
  );
}

/** Every project by name, so any one is a click away. Folders that only hold stray sessions sit behind "Other folders". */
function ProjectLinks({ onPick }: { onPick?: () => void }) {
  const q = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/projects") });
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [others, setOthers] = useState(false);
  const list = q.data ?? [];
  const mine = list.filter((p) => p.group === "root");
  const rest = list.filter((p) => p.group !== "root");
  const row = (p: Project) => {
    const to = `/projects/${encodeURIComponent(p.id)}`;
    const on = path === to;
    return (
      <Link key={p.id} to="/projects/$id" params={{ id: p.id }} search={{}} onClick={onPick} aria-current={on ? "page" : undefined} className={cn(itemClass(on, false), "h-8 pl-8 text-[13.5px]")}>
        <span className="flex-1 truncate">{p.name}</span>
        {p.backlog && p.backlog.open > 0 && <span className="text-[11.5px] text-muted-foreground">{p.backlog.open}</span>}
      </Link>
    );
  };
  return (
    <div className="flex flex-col gap-0.5">
      {mine.map(row)}
      {rest.length > 0 && (
        <>
          <button type="button" onClick={() => setOthers(!others)} aria-expanded={others} className="flex h-8 items-center gap-1.5 rounded-md pl-7 text-left text-[13px] text-muted-foreground hover:bg-sunken">
            <ChevronRight className={cn("size-3.5 transition-transform", others && "rotate-90")} aria-hidden />
            Other folders with sessions ({rest.length})
          </button>
          {others && rest.map(row)}
        </>
      )}
    </div>
  );
}

function NavBody({ collapsed, onToggle, onPick, connected }: { collapsed: boolean; onToggle?: () => void; onPick?: () => void; connected: boolean }) {
  const overview = useQuery({ queryKey: ["overview"], queryFn: () => api.get<any>("/overview") });
  const waiting = useWaiting();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const needs = (overview.data?.needsYou?.length ?? 0) + waiting;
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
          <IconButton label={collapsed ? "Show menu" : "Hide menu"} onClick={onToggle} className="text-muted-foreground">
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </IconButton>
        )}
      </div>
      {!collapsed && <SearchBox onPick={onPick} />}
      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto">
        <TopLink to="/" label="Home" icon={Home} attn={needs || undefined} collapsed={collapsed} onPick={onPick} />
        <TopLink to="/setup" label="Settings" icon={Globe} collapsed={collapsed} onPick={onPick} />
        <TopLink to="/guides" label="Guides" icon={BookOpen} collapsed={collapsed} onPick={onPick} />
        {!collapsed && (
          <>
            <Link to="/projects" onClick={onPick} className={cn("mt-3 px-2.5 pb-1 text-[12.5px] font-medium text-muted-foreground no-underline hover:text-ink", path === "/projects" && "text-ink")}>
              Projects
            </Link>
            <ProjectLinks onPick={onPick} />
          </>
        )}
      </nav>
      <div className={cn("flex flex-col gap-2 pt-2", collapsed && "items-center")}>
        <TopLink to="/preferences" label="App preferences" icon={SlidersHorizontal} collapsed={collapsed} onPick={onPick} />
        {!collapsed && <ThemeSwitch />}
        <div className={cn("flex items-center gap-2 px-1 text-xs text-muted-foreground", collapsed && "justify-center")} title={connected ? "Updates as your files change" : "Reconnecting…"}>
          <span className={cn("size-2 rounded-full", connected ? "bg-ok-dot" : "bg-attn-dot")} aria-hidden />
          {!collapsed && (connected ? "Updates as your files change" : "Reconnecting…")}
        </div>
      </div>
    </div>
  );
}

export function Shell() {
  const connected = useLiveUpdates();
  const mobile = useIsMobile();
  const nav = usePanelRef();
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const layout = useDefaultLayout({ id: "cc-shell", storage: layoutStorage });
  const path = useRouterState({ select: (s) => s.location.pathname });
  const crash = useRouterState({ select: (s) => import.meta.env.DEV && new URLSearchParams(s.location.searchStr).get("crash") === "1" });
  const page = <PageErrorBoundary resetKey={path}>{crash ? <CrashForTesting /> : <Outlet />}</PageErrorBoundary>;
  // The browser tab names the page you're on, like any web app.
  useEffect(() => {
    const seg = path.split("/").filter(Boolean);
    const name: Record<string, string> = { "": "Home", projects: "Projects", setup: "Settings", guides: "Guides", preferences: "App preferences", live: "Session", sessions: "Session", jobs: "Background sessions", new: "New item", add: "Add setting", file: "File", map: "File locations", archive: "Archived items" };
    const page = seg[0] === "projects" && seg[1] ? decodeURIComponent(seg[1]).split("/").pop()! : seg[0] === "file" ? decodeURIComponent(new URLSearchParams(location.search).get("path") ?? "").split("/").pop() || "File" : name[seg[0] ?? ""] ?? "";
    setPageTitle(page);
  }, [path]);
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

  if (mobile) {
    return (
      <LoginGate>
        <div className="flex h-full flex-col">
          <div className="flex h-12 flex-none items-center gap-2 border-b border-line bg-panel px-2">
            <IconButton label="Open menu" size="icon-lg" onClick={() => setDrawer(true)}>
              <Menu />
            </IconButton>
            <Link to="/" className="flex items-center gap-2 font-semibold text-ink no-underline">
              <img src="/favicon.svg" alt="" className="size-5 rounded-md dark:ring-1 dark:ring-white/25" /> Control Center
            </Link>
          </div>
          <main className="min-h-0 flex-1">{page}</main>
          <Dialog open={drawer} onOpenChange={setDrawer}>
            <DialogContent className="h-[80vh] overflow-hidden p-0">
              <DialogTitle className="sr-only">Menu</DialogTitle>
              <NavBody collapsed={false} onPick={() => setDrawer(false)} connected={connected} />
            </DialogContent>
          </Dialog>
        </div>
      </LoginGate>
    );
  }

  return (
    <LoginGate>
      <Group orientation="horizontal" defaultLayout={layout.defaultLayout} onLayoutChanged={layout.onLayoutChanged} className="h-full">
        <Panel id="nav" panelRef={nav} collapsible collapsedSize={56} minSize={190} defaultSize={240} maxSize={320} onResize={() => setNavCollapsed(!!nav.current?.isCollapsed())}>
          <NavBody collapsed={navCollapsed} onToggle={toggleNav} connected={connected} />
        </Panel>
        <Separator aria-label="Resize menu" />
        <Panel id="main" minSize={480}>
          <main className="h-full">{page}</main>
        </Panel>
      </Group>
    </LoginGate>
  );
}
