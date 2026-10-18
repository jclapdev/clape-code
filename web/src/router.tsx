import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";
import { Shell } from "./components/Shell";
import { ArchivePage } from "./pages/Archive";
import { FilePage } from "./pages/File";
import { HomePage } from "./pages/Home";
import { JobsPage } from "./pages/Jobs";
import { LivePage } from "./pages/Live";
import { MapPage } from "./pages/Map";
import { PreferencesPage } from "./pages/Preferences";
import { ProjectsPage } from "./pages/Projects";
import { SessionsPage } from "./pages/Sessions";
import { SettingsPage, type SettingsSearch } from "./pages/Settings";
import { GuidesPage } from "./pages/Guides";
import { NewItemPage, type NewKind } from "./pages/NewItem";
import { AddSettingPage, type AddWhat } from "./pages/AddSetting";
import { CustomizePage, FeaturePage, type FeatureSearch } from "./pages/Feature";
import { NewProjectPage } from "./pages/NewProject";
import { FEATURES } from "./lib/features";

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

const root = createRootRoute({ component: Shell });

const home = createRoute({ getParentRoute: () => root, path: "/", component: HomePage });

const projects = createRoute({ getParentRoute: () => root, path: "/projects", component: ProjectsPage });
const newProject = createRoute({ getParentRoute: () => root, path: "/projects/new", component: NewProjectPage });
const project = createRoute({
  getParentRoute: () => root,
  path: "/projects/$id",
  component: ProjectsPage,
  validateSearch: (s: Record<string, unknown>): { tab?: string } => ({ tab: str(s.tab) }),
});

const sessionsSearch = (s: Record<string, unknown>): { archived?: string; project?: string } => ({ archived: str(String(s.archived ?? "")), project: str(s.project) });
const sessions = createRoute({ getParentRoute: () => root, path: "/sessions", component: SessionsPage, validateSearch: sessionsSearch });
const session = createRoute({ getParentRoute: () => root, path: "/sessions/$sid", component: SessionsPage, validateSearch: sessionsSearch });

const liveSearch = (s: Record<string, unknown>): { new?: string; project?: string; resume?: string; prompt?: string; mode?: string } => ({ new: str(String(s.new ?? "")), project: str(s.project), resume: str(s.resume), prompt: str(s.prompt), mode: str(s.mode) });
const live = createRoute({ getParentRoute: () => root, path: "/live", component: LivePage, validateSearch: liveSearch });
const liveOne = createRoute({ getParentRoute: () => root, path: "/live/$id", component: LivePage, validateSearch: liveSearch });

const jobs = createRoute({ getParentRoute: () => root, path: "/jobs", component: JobsPage });
const job = createRoute({ getParentRoute: () => root, path: "/jobs/$id", component: JobsPage });

// Old addresses land on the pages that replaced them.
const library = createRoute({ getParentRoute: () => root, path: "/library", beforeLoad: () => { throw redirect({ to: "/customize" }); } });
const settings = createRoute({
  getParentRoute: () => root,
  path: "/settings",
  component: SettingsPage,
  validateSearch: (s: Record<string, unknown>): SettingsSearch => ({ project: str(s.project), file: s.file === "local" || s.file === "shared" ? s.file : undefined }),
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

// Setup's skills, agents and other lists moved to the Customize pages, and its settings to Settings.
const setup = createRoute({ getParentRoute: () => root, path: "/setup", beforeLoad: () => { throw redirect({ to: "/settings", search: {} }); } });
const guidesRoute = createRoute({ getParentRoute: () => root, path: "/guides", component: GuidesPage });
const guide = createRoute({ getParentRoute: () => root, path: "/guides/$slug", component: GuidesPage });
const newItem = createRoute({
  getParentRoute: () => root,
  path: "/new",
  component: NewItemPage,
  validateSearch: (s: Record<string, unknown>): { kind?: NewKind; scope?: string } => ({ kind: (str(s.kind) as NewKind) ?? "skill", scope: str(s.scope) }),
});

const addSetting = createRoute({
  getParentRoute: () => root,
  path: "/add",
  component: AddSettingPage,
  validateSearch: (s: Record<string, unknown>): { what?: AddWhat; scope?: string } => ({ what: (str(s.what) as AddWhat) ?? "permission", scope: str(s.scope) }),
});

// Customize: an overview, then one page per feature, all drawn by the same component.
const customize = createRoute({ getParentRoute: () => root, path: "/customize", component: CustomizePage });
const featureSearch = (s: Record<string, unknown>): FeatureSearch => ({ item: str(s.item), project: str(s.project), q: str(s.q), panel: s.panel === "find" || s.panel === "new" ? s.panel : undefined });
const features = FEATURES.map((f) => createRoute({ getParentRoute: () => root, path: `/${f.id}`, component: FeaturePage, validateSearch: featureSearch }));

const routeTree = root.addChildren([customize, ...features, newProject, addSetting, setup, guidesRoute, guide, newItem, home, projects, project, sessions, session, live, liveOne, jobs, job, library, settings, map, archive, file, preferences]);

export const router = createRouter({ routeTree, defaultPreload: false });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
