# Progress

Where Control Center stands, for whoever picks it up next. Read this first; update it after each finished item.

## Done

- [x] Menu cut to Home, All projects, Guides and the projects by name; command palette and the Sessions, Live, Jobs, Library, Settings and Map menu entries removed (2026-10-18).
- [x] One page per project with every section showing, and an All projects page for what applies everywhere (2026-10-18).
- [x] Readable views for every file, and Markdown edited in live preview so saving changes only what was typed (2026-10-18).
- [x] Create skills, commands, agents, rules, output styles, memory notes, instructions, hooks, permission rules and MCP servers from forms with the official guide beside them (2026-10-18).
- [x] Slash command list in sessions, visible search in the menu, Guides page (2026-10-18).

## In progress

Reorganising the app around Claude Code's features. The approved plan is `~/.claude/plans/encapsulated-mixing-clarke.md`; follow it step by step. The 2026-10-18 overhaul is committed as 7412c68; work since then is in the "WIP" commit after it.

- [x] 1. Checkpoint commit.
- [ ] 2. Shell and menu: `web/src/components/Shell.tsx` rewritten (phone full-screen menu, 768–1279 px icon strip, 1280 px+ full menu with Projects and Customize groups). Not yet checked in a browser. Its links point at routes that don't exist yet (`/sessions`, `/customize`, `/settings`, `/projects/new`, one per feature), so the web typecheck fails until step 3 adds them.
- [ ] 3. Feature pages: `web/src/lib/features.ts` lists the 12 Customize features (name, intro from the docs, item kinds, New button, guide). Still to write: `web/src/pages/Feature.tsx` (search, project filter, list, open item, delete into the archive via `/library/archive`), the `/customize` overview page, and the routes in `web/src/router.tsx`. Move `ItemActions` out of `pages/Projects.tsx` into a shared component. `ArchiveKind` in `server/src/fs/archive.ts` needs `workflow` and `scheduled-task` added.
- [ ] 4. Server: done so far: `server/src/scan/catalog.ts` (every item across home folder, projects and plugins, including MCP servers, workflows and scheduled tasks, each tagged with its project); endpoints `/catalog`, `/hooks/remove`, `/mcp/remove`, `/plugins/available?q=`, `/plugins/{install,uninstall,enable,disable}` and `/plugins-new` in `server/src/api/content.ts`; workflows/, scheduled-tasks/ and themes/ made editable in `server/src/fs/policy.ts`; hooks carry their group and index. Still to do: tests for these in `server/test/`, and the Slash commands list (reuse `/live-commands`).
- [ ] 5–11 as in the plan: plugins page, projects (new project, board from PROGRESS.md, add context, cka-prep and sharepoint backlog move), Settings page, Home, Sessions page, redirects, notes.

Facts checked against the live docs on 2026-10-18: plugin commands take `--json`; `claude plugin list --json --available` prints one pretty-printed object (about 3,800 plugins, 2.2 MB, so it's cached for 10 minutes); `claude plugin init <name>` creates `~/.claude/skills/<name>/`; MCP servers live in `~/.claude.json` (user, and local under `projects[path]`), in `.mcp.json` (project), and in a plugin's `.mcp.json` or `plugin.json`; workflows are `.js` files with `export const meta = { name, description }`; Desktop scheduled tasks keep only name, description and prompt in `~/.claude/scheduled-tasks/<name>/SKILL.md`. Before building "create a scheduled task", test whether the Desktop app picks up a folder the app makes, and ask John if it doesn't.

## Next

- [ ] Share rules between the exercise projects (cka-prep, sharepoint) without moving them. Its own session, starting with research. Found so far: the style list is already copied into both (differs by one folder name); the cold-reader, style-reader and build-exercise skill assume Kubernetes and need rewording; the two copies of the study app already differ in 33 files; Claude Code asks once per project before loading an import from outside the project folder.
- [ ] Show on each project page what it gets from shared rules and plugins.
- [ ] Open background sessions full width, like other sessions, instead of the old list page.
- [ ] Check every page at 390 px wide and in the light theme after the 2026-10-18 changes.
- [ ] Run the Windows test steps in docs/windows-test.md on a Windows PC.
- [ ] After a week of daily use, review Preferences > "How you use this app" and FEEDBACK.md.

## Notes

- Projects aren't moved into each other: Claude Code files sessions and memory under the folder path, and git worktrees store absolute paths, so a move breaks both.
- The project page falls back to unfinished plan items only when a project has no PROGRESS.md or BACKLOG.md. It never shows commits as a changelog.
