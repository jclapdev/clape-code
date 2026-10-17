import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Shell } from "./components/Shell";
import { ArchivePage } from "./pages/Archive";
import { FilePage } from "./pages/File";
import { HomePage } from "./pages/Home";
import { JobsPage } from "./pages/Jobs";
import { LibraryPage } from "./pages/Library";
import { LivePage } from "./pages/Live";
import { MapPage } from "./pages/Map";
import { PreferencesPage } from "./pages/Preferences";
import { ProjectsPage } from "./pages/Projects";
import { SessionsPage } from "./pages/Sessions";
import { SettingsPage } from "./pages/Settings";

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

const root = createRootRoute({ component: Shell });

const home = createRoute({ getParentRoute: () => root, path: "/", component: HomePage });

const projects = createRoute({ getParentRoute: () => root, path: "/projects", component: ProjectsPage });
const project = createRoute({
  getParentRoute: () => root,
  path: "/projects/$id",
  component: ProjectsPage,
  validateSearch: (s: Record<string, unknown>): { tab?: string } => ({ tab: str(s.tab) }),
});

const sessionsSearch = (s: Record<string, unknown>): { archived?: string; project?: string } => ({ archived: str(String(s.archived ?? "")), project: str(s.project) });
const sessions = createRoute({ getParentRoute: () => root, path: "/sessions", component: SessionsPage, validateSearch: sessionsSearch });
const session = createRoute({ getParentRoute: () => root, path: "/sessions/$sid", component: SessionsPage, validateSearch: sessionsSearch });

const liveSearch = (s: Record<string, unknown>): { new?: string; project?: string; resume?: string } => ({ new: str(String(s.new ?? "")), project: str(s.project), resume: str(s.resume) });
const live = createRoute({ getParentRoute: () => root, path: "/live", component: LivePage, validateSearch: liveSearch });
const liveOne = createRoute({ getParentRoute: () => root, path: "/live/$id", component: LivePage, validateSearch: liveSearch });

const jobs = createRoute({ getParentRoute: () => root, path: "/jobs", component: JobsPage });
const job = createRoute({ getParentRoute: () => root, path: "/jobs/$id", component: JobsPage });

const library = createRoute({
  getParentRoute: () => root,
  path: "/library",
  component: LibraryPage,
  validateSearch: (s: Record<string, unknown>): { kind?: string; scope?: string; path?: string } => ({ kind: str(s.kind), scope: str(s.scope), path: str(s.path) }),
});
const settings = createRoute({
  getParentRoute: () => root,
  path: "/settings",
  component: SettingsPage,
  validateSearch: (s: Record<string, unknown>): { project?: string; key?: string } => ({ project: str(s.project), key: str(s.key) }),
});
const map = createRoute({ getParentRoute: () => root, path: "/map", component: MapPage });
const archive = createRoute({ getParentRoute: () => root, path: "/archive", component: ArchivePage });
const file = createRoute({
  getParentRoute: () => root,
  path: "/file",
  component: FilePage,
  validateSearch: (s: Record<string, unknown>): { path?: string } => ({ path: str(s.path) }),
});
const preferences = createRoute({ getParentRoute: () => root, path: "/preferences", component: PreferencesPage });

const routeTree = root.addChildren([home, projects, project, sessions, session, live, liveOne, jobs, job, library, settings, map, archive, file, preferences]);

export const router = createRouter({ routeTree, defaultPreload: false });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
