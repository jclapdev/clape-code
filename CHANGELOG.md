# Changelog

Notable changes to Control Center, newest first.

## Unreleased

### Added

- A Customize section with one page for each thing that changes how Claude Code works: instructions, skills, slash commands, agents, hooks, MCP servers, plugins, plans, scheduled tasks, output styles, memory and workflows. Each page lists every item from every project and plugin, says where it applies, and has a search box, a project filter and a New button.
- Open any item to read it, edit it in place or delete it. Deleted files go to Archived items, where you can restore them.
- The Slash commands page lists Claude Code's own commands next to yours, each with "Run in a new session".
- The Memory page also lists the notes your agents keep for themselves (agents with `memory` set), tagged "Agent: <name>".
- The menu has Home, Sessions, Projects, Customize, Settings and Guides. On a phone it opens full screen; on tablets it's a strip of icons.

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

- Deleting a skill, agent, command, rule, output style, plan or memory note from a project page moves it to Archived items instead of the computer's trash.
- Opening a file to edit right after reading it no longer shows an empty editor.

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
