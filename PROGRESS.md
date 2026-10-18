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
- [x] 2. Shell and menu (2026-10-18): phone full-screen menu, 768–1279 px icon strip, 1280 px+ full menu with Projects and Customize groups. Checked at 390, 768, 1024 and 1440 px in light and dark: nothing runs off the screen or is clipped, and the menu scrolls as one piece.
- [x] 3. Feature pages (2026-10-18): `web/src/pages/Feature.tsx` draws all 12 Customize pages from `web/src/lib/features.ts` and `/api/catalog`, plus the `/customize` overview and a placeholder `/projects/new`. Item, filter and search sit in the URL. Delete goes through the shared `web/src/components/ItemActions.tsx` (archive, `/hooks/remove` or `/mcp/remove`; plugin and claude.ai items say they come with their source). `/settings` shows the Setup page until step 7.
- [ ] 4. Server: done so far: `server/src/scan/catalog.ts`, endpoints `/catalog`, `/hooks/remove`, `/mcp/remove`, `/plugins/available?q=`, `/plugins/{install,uninstall,enable,disable}` and `/plugins-new`; workflows/, scheduled-tasks/ and themes/ editable in `classify`; tests for `workflowMeta`, `removeHook` and those `classify` cases (`server/test/catalog.test.ts`, `server/test/fs.test.ts`); the Slash commands page reads `/live-commands`. **Next:** readers for agent-memory/, keybindings.json, themes/ and .worktreeinclude in `server/src/scan/library.ts`, with `classify` cases.
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

- Run the dev server as two processes (`bun src/index.ts` in server/, `bun run dev` in web/) for browser checks. Under `bun run dev` the server was stopped by SIGTERM every few minutes on 2026-10-18 and took Vite down with it; the cause wasn't found.
- `/sessions` still sends you to Projects (from the 2026-10-18 overhaul) until step 9 builds the Sessions page.
- The browser check script must also flag sideways scrolling inside panes, not just the page: the first pass missed a select that pushed the item view wider than a phone.

- Projects aren't moved into each other: Claude Code files sessions and memory under the folder path, and git worktrees store absolute paths, so a move breaks both.
- The project page falls back to unfinished plan items only when a project has no PROGRESS.md or BACKLOG.md. It never shows commits as a changelog.
