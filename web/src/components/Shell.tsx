import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { BookOpen, ChevronRight, FolderGit2, Home, LayoutGrid, Menu, MessagesSquare, Monitor, Moon, Plus, Settings2, SlidersHorizontal, Sun, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { FEATURES } from "@/lib/features";
import { setPageTitle, useLiveUpdates, useWaiting } from "@/lib/live";
import { layoutStorage, useMediaQuery } from "@/lib/prefs";
import type { Project } from "@/lib/types";
import { useTheme } from "next-themes";
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

const usePath = () => useRouterState({ select: (s) => s.location.pathname });
const isOn = (path: string, to: string) => (to === "/" ? path === "/" : path === to || path.startsWith(`${to}/`));

const itemClass = (on: boolean) =>
  cn(
    "relative flex h-9 flex-none items-center gap-2.5 rounded-md px-2.5 text-[14px] text-ink-2 no-underline hover:bg-sunken hover:text-ink",
    on && "bg-accent font-semibold text-accent-foreground hover:bg-accent hover:text-accent-foreground",
  );

function NavLink({ to, label, icon: Icon, attn, onPick, sub }: { to: string; label: string; icon?: LucideIcon; attn?: number; onPick?: () => void; sub?: boolean }) {
  const on = isOn(usePath(), to);
  return (
    <Link to={to} onClick={onPick} aria-current={on ? "page" : undefined} className={cn(itemClass(on), sub && "h-8 text-[13.5px]")}>
      {Icon && <Icon className="size-4 flex-none" aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {attn ? (
        <span className="rounded-full bg-attn-dot px-1.5 text-[11px] font-semibold text-white" aria-label={`${attn} need you`}>
          {attn}
        </span>
      ) : null}
    </Link>
  );
}

/** A heading in the menu that folds its links away. Remembered per browser. */
function Group({ id, label, to, onPick, children }: { id: string; label: string; to: string; onPick?: () => void; children: React.ReactNode }) {
  const key = `cc-menu-${id}`;
  const [open, setOpen] = useState(() => layoutStorage.getItem(key) !== "closed");
  const on = usePath() === to;
  const flip = () => {
    layoutStorage.setItem(key, open ? "closed" : "open");
    setOpen(!open);
  };
  return (
    <div className="mt-3 flex flex-col gap-0.5">
      <div className="flex items-center">
        <button type="button" onClick={flip} aria-expanded={open} aria-label={`${open ? "Fold" : "Unfold"} ${label}`} className="flex size-7 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-sunken">
          <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} aria-hidden />
        </button>
        <Link to={to} onClick={onPick} aria-current={on ? "page" : undefined} className={cn("flex-1 rounded-md px-1 py-1 text-[12.5px] font-semibold uppercase tracking-wide text-muted-foreground no-underline hover:text-ink", on && "text-ink")}>
          {label}
        </Link>
      </div>
      {open && <div className="flex flex-col gap-0.5 pl-2">{children}</div>}
    </div>
  );
}

function useProjects() {
  const q = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/projects") });
  return (q.data ?? []).filter((p) => p.group === "root");
}

function useNeeds() {
  const overview = useQuery({ queryKey: ["overview"], queryFn: () => api.get<any>("/overview") });
  return (overview.data?.needsYou?.length ?? 0) + useWaiting();
}

function Brand({ onPick }: { onPick?: () => void }) {
  return (
    <Link to="/" onClick={onPick} className="flex min-w-0 items-center gap-2 text-ink no-underline">
      <img src="/favicon.svg" alt="" className="size-6 flex-none rounded-md dark:ring-1 dark:ring-white/25" />
      <span className="truncate whitespace-nowrap text-[14px] font-semibold">Control Center</span>
    </Link>
  );
}

function Status({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
      <span className={cn("size-2 flex-none rounded-full", connected ? "bg-ok-dot" : "bg-attn-dot")} aria-hidden />
      {connected ? "Updates as your files change" : "Reconnecting…"}
    </div>
  );
}

/** The full menu: on wide screens beside the page, on phones as a full-screen sheet. The whole column scrolls as one. */
function FullMenu({ onPick, connected }: { onPick?: () => void; connected: boolean }) {
  const projects = useProjects();
  const needs = useNeeds();
  return (
    <div className="flex min-h-full flex-col gap-2 px-3 py-3">
      <div className="flex h-8 items-center pl-1.5 pr-10 md:pr-0">
        <Brand onPick={onPick} />
      </div>
      <SearchBox onPick={onPick} />
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        <NavLink to="/" label="Home" icon={Home} attn={needs || undefined} onPick={onPick} />
        <NavLink to="/sessions" label="Sessions" icon={MessagesSquare} onPick={onPick} />
        <Group id="projects" label="Projects" to="/projects" onPick={onPick}>
          {projects.map((p) => (
            <NavLink key={p.id} to={`/projects/${encodeURIComponent(p.id)}`} label={p.name} onPick={onPick} sub />
          ))}
          <NavLink to="/projects/new" label="New project" icon={Plus} onPick={onPick} sub />
        </Group>
        <Group id="customize" label="Customize" to="/customize" onPick={onPick}>
          {FEATURES.map((f) => (
            <NavLink key={f.id} to={`/${f.id}`} label={f.label} icon={f.icon} onPick={onPick} sub />
          ))}
        </Group>
        <div className="mt-3 flex flex-col gap-0.5">
          <NavLink to="/settings" label="Settings" icon={Settings2} onPick={onPick} />
          <NavLink to="/guides" label="Guides" icon={BookOpen} onPick={onPick} />
        </div>
      </nav>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <NavLink to="/preferences" label="App preferences" icon={SlidersHorizontal} onPick={onPick} />
        <ThemeSwitch />
        <Status connected={connected} />
      </div>
    </div>
  );
}

function RailLink({ to, label, icon: Icon, attn }: { to: string; label: string; icon: LucideIcon; attn?: number }) {
  const path = usePath();
  const on = isOn(path, to) || (to === "/customize" && FEATURES.some((f) => isOn(path, `/${f.id}`)));
  return (
    <Link to={to} aria-current={on ? "page" : undefined} className={cn("relative flex w-full flex-none flex-col items-center gap-1 rounded-md px-1 py-2 text-[11.5px] leading-tight text-ink-2 no-underline hover:bg-sunken hover:text-ink", on && "bg-accent font-semibold text-accent-foreground hover:bg-accent hover:text-accent-foreground")}>
      <Icon className="size-5" aria-hidden />
      <span className="text-center">{label}</span>
      {attn ? <span className="absolute right-2 top-1.5 size-2 rounded-full bg-attn-dot" aria-label={`${attn} need you`} /> : null}
    </Link>
  );
}

/** Tablets and small laptops: icons with their names underneath, so the page keeps most of the width. */
function Rail({ connected }: { connected: boolean }) {
  const needs = useNeeds();
  return (
    <nav aria-label="Main" className="flex h-full w-[84px] flex-none flex-col items-center gap-1 overflow-y-auto border-r border-line bg-panel px-1.5 py-3">
      <Link to="/" className="mb-2" aria-label="Control Center home">
        <img src="/favicon.svg" alt="" className="size-7 rounded-md dark:ring-1 dark:ring-white/25" />
      </Link>
      <RailLink to="/" label="Home" icon={Home} attn={needs || undefined} />
      <RailLink to="/sessions" label="Sessions" icon={MessagesSquare} />
      <RailLink to="/projects" label="Projects" icon={FolderGit2} />
      <RailLink to="/customize" label="Customize" icon={LayoutGrid} />
      <RailLink to="/settings" label="Settings" icon={Settings2} />
      <RailLink to="/guides" label="Guides" icon={BookOpen} />
      <div className="mt-auto flex flex-col items-center gap-2 pt-3">
        <RailLink to="/preferences" label="App" icon={SlidersHorizontal} />
        <span className={cn("size-2 rounded-full", connected ? "bg-ok-dot" : "bg-attn-dot")} title={connected ? "Updates as your files change" : "Reconnecting…"} />
      </div>
    </nav>
  );
}

const TITLES: Record<string, string> = { "": "Home", projects: "Projects", customize: "Customize", settings: "Settings", guides: "Guides", preferences: "App preferences", live: "Session", sessions: "Sessions", jobs: "Background session", new: "New item", add: "Add setting", file: "File", archive: "Archived items" };

export function Shell() {
  const connected = useLiveUpdates();
  const phone = useIsMobile();
  const wide = useMediaQuery("(min-width: 1280px)");
  const [drawer, setDrawer] = useState(false);
  const path = usePath();
  const crash = useRouterState({ select: (s) => import.meta.env.DEV && new URLSearchParams(s.location.searchStr).get("crash") === "1" });
  const page = <PageErrorBoundary resetKey={path}>{crash ? <CrashForTesting /> : <Outlet />}</PageErrorBoundary>;
  // The browser tab names the page you're on, like any web app.
  useEffect(() => {
    const seg = path.split("/").filter(Boolean);
    const feature = FEATURES.find((f) => f.id === seg[0]);
    const title =
      seg[0] === "projects" && seg[1] && seg[1] !== "new"
        ? decodeURIComponent(seg[1]).split("/").pop()!
        : seg[0] === "file"
          ? decodeURIComponent(new URLSearchParams(location.search).get("path") ?? "").split("/").pop() || "File"
          : (feature?.label ?? TITLES[seg[0] ?? ""] ?? "");
    setPageTitle(title);
  }, [path]);
  useEffect(() => {
    const view = path.split("/")[1] || "home";
    api.post("/metrics/view", { view }).catch(() => {});
  }, [path]);

  if (phone) {
    return (
      <LoginGate>
        <div className="flex h-full flex-col">
          <div className="flex h-12 flex-none items-center gap-2 border-b border-line bg-panel px-2">
            <IconButton label="Open menu" size="icon-lg" onClick={() => setDrawer(true)}>
              <Menu />
            </IconButton>
            <Brand />
          </div>
          <main className="min-h-0 flex-1">{page}</main>
          <Dialog open={drawer} onOpenChange={setDrawer}>
            <DialogContent className="inset-0 top-0 left-0 block h-dvh w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none bg-panel p-0 ring-0 sm:max-w-none">
              <DialogTitle className="sr-only">Menu</DialogTitle>
              <FullMenu onPick={() => setDrawer(false)} connected={connected} />
            </DialogContent>
          </Dialog>
        </div>
      </LoginGate>
    );
  }

  return (
    <LoginGate>
      <div className="flex h-full">
        {wide ? (
          <aside className="h-full w-64 flex-none overflow-y-auto border-r border-line bg-panel">
            <FullMenu connected={connected} />
          </aside>
        ) : (
          <Rail connected={connected} />
        )}
        <main className="h-full min-w-0 flex-1">{page}</main>
      </div>
    </LoginGate>
  );
}
