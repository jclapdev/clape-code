# Changelog

Notable changes to Control Center, newest first.

## Unreleased

### Added

- A search box at the top of the menu finds sessions by what was said, plus plans, skills, agents and documents.
- All projects shows what applies in every project: your instructions, skills, agents, commands, plugins, hooks, rules, output styles, plans and settings.
- Guides shows Claude Code's official guides as formatted pages.
- Every section has a button to create its kind of thing, with the official guide beside the form: skills, commands, agents, rules, output styles, memory notes, instructions, hooks, permission rules and MCP servers.
- "Plan something", "Have Claude write it" and "Have Claude make one" start a session that does it.
- Typing / in a session lists every command and skill it accepts, with descriptions.
- Each session shows the plan it wrote, and plans open as formatted pages.
- An "Up next" box at the top of each project, from its PROGRESS.md.
- Home lists sessions stopped by a usage limit that has since reset under Paused, with Continue.

### Changed

- The menu is Home, All projects, Guides and your projects by name.
- A project opens as one page with every section showing and a count for each, instead of tabs.
- Files open in place as readable text; Markdown is edited in live preview, so saving changes only what you typed.
- Skills and plugins are turned on or off from the item itself.
- Error messages say what went wrong and what to do, with Try again.
- Section titles name what each section holds, such as Recent changes, Running sessions and Needs your attention.

### Removed

- The command palette and its hidden keyboard shortcuts.
- The separate Sessions, Live, Jobs, Library, Settings and Map menu entries. Old links land on the pages that replaced them.

### Fixed

- Home no longer says background sessions need you when they only stopped at a usage limit that has since reset.

## 2026-10-17

### Added

- First version: your Claude Code projects, sessions, skills, agents, settings and background sessions in one place, with safe editing that keeps a backup and refuses to overwrite a file that changed since you opened it.
- Start, continue and answer Claude sessions from the app.
- Runs as one program on macOS, Linux and Windows, on this computer only or on your home network with a password.
