import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";
import { Shell } from "./components/Shell";
import { ArchivePage } from "./pages/Archive";
import { FilePage } from "./pages/File";
import { HomePage } from "./pages/Home";
import { JobsPage } from "./pages/Jobs";
import { ConversationPage, NewSessionPage } from "./pages/Conversation";
import { LivePage } from "./pages/Live";
import { PreferencesPage } from "./pages/Preferences";
import { ProjectsPage } from "./pages/Projects";
import { SessionsPage, type SessionsSearch } from "./pages/Sessions";
import { SettingsPage, type SettingsSearch } from "./pages/Settings";
import { GuidesPage } from "./pages/Guides";
import { NewItemPage, type NewKind } from "./pages/NewItem";
import { AddSettingPage, type AddWhat } from "./pages/AddSetting";
import { CustomizePage, FeaturePage, type FeatureSearch } from "./pages/Feature";
import { NewProjectPage } from "./pages/NewProject";
import { FEATURES } from "./lib/features";
import { newSessionSearch } from "./lib/newSession";

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

const sessionsSearch = (s: Record<string, unknown>): SessionsSearch => ({ project: str(s.project), needs: s.needs === true || s.needs === "true" || s.needs === "1" || s.needs === 1 ? true : undefined, q: str(s.q) });
const sessions = createRoute({ getParentRoute: () => root, path: "/sessions", component: SessionsPage, validateSearch: sessionsSearch });
const session = createRoute({ getParentRoute: () => root, path: "/sessions/$sid", component: ConversationPage });

const newSession = createRoute({ getParentRoute: () => root, path: "/sessions/new", component: NewSessionPage, validateSearch: newSessionSearch });

// Old addresses: /live was the New session form, and ?resume=<session id> its resume form.
const live = createRoute({
  getParentRoute: () => root,
  path: "/live",
  validateSearch: (s: Record<string, unknown>) => ({ ...newSessionSearch(s), resume: str(s.resume) }),
  beforeLoad: ({ search: { resume, ...rest } }) => {
    if (resume) throw redirect({ to: "/sessions/$sid", params: { sid: resume }, replace: true });
    throw redirect({ to: "/sessions/new", search: rest, replace: true });
  },
});
// An old live-session link opens that session's conversation page.
const liveOne = createRoute({ getParentRoute: () => root, path: "/live/$id", component: LivePage });

// Background sessions are listed with the rest on Sessions; /jobs/<id> opens the conversation when it has a session ID.
const jobs = createRoute({ getParentRoute: () => root, path: "/jobs", beforeLoad: () => { throw redirect({ to: "/sessions", search: {} }); } });
const job = createRoute({ getParentRoute: () => root, path: "/jobs/$id", component: JobsPage });

// Old addresses land on the pages that replaced them.
// The old Library took ?kind= and ?scope= (global or a project id); each kind now has its own page.
const LIBRARY_KIND: Record<string, string> = { skill: "skills", command: "skills", agent: "agents", rule: "instructions", "claude-md": "instructions", "output-style": "output-styles", hook: "hooks", plan: "plans", memory: "memory", workflow: "workflows", mcp: "mcp", plugin: "plugins" };
const library = createRoute({
  getParentRoute: () => root,
  path: "/library",
  validateSearch: (s: Record<string, unknown>): { kind?: string; scope?: string } => ({ kind: str(s.kind), scope: str(s.scope) }),
  beforeLoad: ({ search }) => {
    const feature = LIBRARY_KIND[search.kind ?? ""];
    const project = search.scope && search.scope !== "global" ? search.scope : undefined;
    if (feature) throw redirect({ to: `/${feature}` as "/skills", search: project ? { project } : {} });
    throw redirect({ to: "/customize" });
  },
});
// File locations (/map) isn't linked from anywhere since the menu changed; Customize lists every kind of file.
const map = createRoute({ getParentRoute: () => root, path: "/map", beforeLoad: () => { throw redirect({ to: "/customize" }); } });
const settings = createRoute({
  getParentRoute: () => root,
  path: "/settings",
  component: SettingsPage,
  validateSearch: (s: Record<string, unknown>): SettingsSearch => ({ project: str(s.project), file: s.file === "local" || s.file === "shared" ? s.file : undefined }),
});
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
  // name and body start the form filled in, as Home's suggestions do.
  validateSearch: (s: Record<string, unknown>): { kind?: NewKind; scope?: string; name?: string; body?: string } => ({ kind: (str(s.kind) as NewKind) ?? "skill", scope: str(s.scope), name: str(s.name), body: str(s.body) }),
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

const routeTree = root.addChildren([customize, ...features, newProject, addSetting, setup, guidesRoute, guide, newItem, home, projects, project, sessions, newSession, session, live, liveOne, jobs, job, library, settings, map, archive, file, preferences]);

export const router = createRouter({ routeTree, defaultPreload: false });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
