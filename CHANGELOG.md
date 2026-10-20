# Changelog

Notable changes to Control Center, newest first.

## Unreleased

### Added

- A Customize section with one page for each thing that changes how Claude Code works: instructions, skills, slash commands, agents, hooks, MCP servers, plugins, plans, scheduled tasks, output styles, memory and workflows. Each page lists every item from every project and plugin, says where it applies, and has a search box, a project filter and a New button.
- Open any item to read it, edit it in place or delete it. Deleted files go to Archived items, where you can restore them.
- The Slash commands page lists Claude Code's own commands next to yours, each with "Run in a new session".
- The Memory page also lists the notes your agents keep for themselves (agents with `memory` set), tagged "Agent: <name>".
- The Plugins page turns each plugin on and off and uninstalls it, using Claude Code's own plugin commands. "Find plugins" searches every marketplace you have (about 3,800 plugins), showing what each does and how many people installed it, with Install. "New plugin" makes a starter plugin in your skills folder and opens it, with its files listed. When Claude Code refuses, its own message shows.
- Plugins you made in your skills folder show on the Plugins page. Removing one moves its folder to Archived items.
- The menu has Home, Sessions, Projects, Customize, Settings and Guides. On a phone it opens full screen; on tablets it's a strip of icons.
- Each project page opens on a board of its PROGRESS.md: Next, In progress and Done. Drag a card to another column, or use its menu ("Move to…"), which is how phones move cards. Add, edit and delete cards; a `#label` at the end of a card shows as a tag. Saving changes only the lines of that card, and the file's other sections stay as they are. A project without PROGRESS.md gets a "Start a board" button.
- New project makes a folder in your projects folder with git, a starter CLAUDE.md and an empty board, and offers "Have Claude set it up", which opens a new session with /init.
- Add context: drop text files on a project page, or pick them, to copy them into its docs/ folder. Each file has a "Claude reads this every session" switch that adds or removes its `@docs/…` line in CLAUDE.md.
- The project page is now a summary: the board, Up next, how many instructions, skills, agents, hooks and so on the project has (each opens that page filtered to the project), recent sessions, context files, changelog, docs and .worktreeinclude.
- A Settings page for how Claude Code behaves: permission rules (allow, ask first, never allow), model, environment variables, status line, sandbox, keyboard shortcuts and themes, each with one sentence on what it does. Pick whether to change your settings for every project, a project's shared settings or your own settings for that project; the page lists the files in the order Claude Code ranks them and says which file's value is in effect when more than one sets it, with "Edit as text" for each file. Environment variable values stay hidden until you click "Show value".
- Home says what the app is for and has a "Build your setup" panel: one card for each sign, from Claude Code's own guide, that a feature would help (such as "Claude gets a convention or a command wrong twice"), each with a button that creates that thing and a link to its page. Below it, one list of sessions: those that need you, those paused at a usage limit, then the 6 most recent, each with Continue and Open. The separate Background sessions, Projects and Changelog lists on Home are gone.
- A Sessions page lists every session in every project, newest first, background sessions included, with a search by title, a project picker, a "Needs you" filter and New session. Each line has Continue and Open. An opened session is its own page with Back. A background session opens full width with its state and what it did.

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
- Home's "All sessions" link opens the Sessions page, and a project page's "Show all N sessions" opens it filtered to that project.
- Stopping or closing a live session returns to Sessions.
- Nothing sits in a second column beside the menu. On wide screens the Customize pages and Sessions list take the full width, and an item or session opens as its own page with a link back. Guides lists the guides as cards only, and a guide opens on its own page with "Guides" to go back.

- A project opens as one page with every section showing and a count for each, instead of tabs.
- Files open in place as readable text; Markdown is edited in live preview, so saving changes only what you typed.
- Skills and plugins are turned on or off from the item itself.
- Error messages say what went wrong and what to do, with Try again.
- Section titles name what each section holds, such as Recent changes, Running sessions and Needs your attention.

### Removed

- The Setup page. Its skills, agents and other lists are on the Customize pages, its settings on Settings; /setup opens Settings and /library opens Customize.
- The command palette and its hidden keyboard shortcuts.
- The separate Sessions, Live, Jobs, Library, Settings and Map menu entries. Old links land on the pages that replaced them: /jobs and /live open Sessions, /map opens Customize, and an old Library link to one kind of item, such as agents, opens that kind's page.
- The File locations page (/map).

### Fixed

- Guides show lists, tables and bold lines inside the docs' tabs as formatted text instead of raw code, and a code block inside a list item no longer swallows the text after it.
- The "How to write a good one" guide on the New forms folds under the form below 1280 px wide, so phones and tablets can read it too, and sits beside the form from 1280 px.
- After creating something for one project, the app opens that feature's page filtered to the project, instead of the project page, which no longer lists those items.
- Deleting an open item no longer reports errors in the browser console while its view closes.
- Archived items on a phone show each name on one line, with the date and Restore below.
- The browser console no longer shows "Encountered a script tag while rendering React component" on every page.
- Cancelling "Delete this session?" no longer leaves the session page.
- Home no longer says background sessions need you when they only stopped at a usage limit that has since reset.

## 2026-10-17

### Added

- First version: your Claude Code projects, sessions, skills, agents, settings and background sessions in one place, with safe editing that keeps a backup and refuses to overwrite a file that changed since you opened it.
- Start, continue and answer Claude sessions from the app.
- Runs as one program on macOS, Linux and Windows, on this computer only or on your home network with a password.
