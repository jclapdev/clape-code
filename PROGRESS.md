# Progress

Where Control Center stands, for whoever picks it up next. Read this first; update it after each finished item.

## Done

- [x] Menu cut to Home, All projects, Guides and the projects by name; command palette and the Sessions, Live, Jobs, Library, Settings and Map menu entries removed (2026-10-18).
- [x] One page per project with every section showing, and an All projects page for what applies everywhere (2026-10-18).
- [x] Readable views for every file, and Markdown edited in live preview so saving changes only what was typed (2026-10-18).
- [x] Create skills, commands, agents, rules, output styles, memory notes, instructions, hooks, permission rules and MCP servers from forms with the official guide beside them (2026-10-18).
- [x] Slash command list in sessions, visible search in the menu, Guides page (2026-10-18).

## In progress

- [ ] John reviews the 2026-10-18 overhaul (branch design-overhaul, not committed yet).

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
