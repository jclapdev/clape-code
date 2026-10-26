# Changelog

Notable changes to Control Center, newest first.

## Unreleased

### Added

- Settings opens with an Account section: how Claude Code signs in (Claude account, API key, Amazon Bedrock and so on), with the email, organization and plan. Pick a project under "Change settings for" to see the account Claude Code uses in that project.
- Sign in with a Claude account from Settings: open the Claude sign-in page, paste the code it shows, and the Account section updates. Claude Code's own message shows when a code is wrong. "Sign out" asks first. Both run Claude Code's `claude auth login` and `claude auth logout`, so the terminal uses the same login.
- Sessions started from Control Center show the account they run on (email and plan, or the provider such as Amazon Bedrock) in the session's header, its line on Sessions and Home, and its transcript page. The New session form shows the account the session will use. Sessions started in the terminal show none, because Claude Code doesn't record it.
- The Control Center window also works with home network mode on. It connects over a local-only address that other devices can't reach; phones and other computers still use the https address and the password.
- Control Center is an app in Applications: open it from there or from Spotlight, with its own icon, name and menus, and quitting it stops it. `bun run app` rebuilds and reinstalls it after code changes, and `bun run desktop` opens a development copy.
- A Customize section with one page for each thing that changes how Claude Code works: instructions, skills, slash commands, agents, hooks, MCP servers, plugins, plans, scheduled tasks, output styles, memory and workflows. Each page lists every item from every project and plugin, says where it applies, and has a search box, a project filter and a New button.
- Open any item to read it, edit it in place or delete it. Deleted files go to Archived items, where you can restore them.
- The Slash commands page lists Claude Code's own commands next to yours, each with "Run in a new session".
- The Memory page also lists the notes your agents keep for themselves (agents with `memory` set), tagged "Agent: <name>".
- The Plugins page turns each plugin on and off and uninstalls it, using Claude Code's own plugin commands and showing its message when it refuses. "Find plugins" searches every marketplace you have (about 3,800 plugins) with Install, and "New plugin" makes a starter plugin in your skills folder.
- Plugins you made in your skills folder show on the Plugins page. Removing one moves its folder to Archived items.
- The menu has Home, Sessions, Projects, Customize, Settings and Guides. On a phone it opens full screen; on tablets it's a strip of icons.
- Each project page opens on a board of its PROGRESS.md (Next, In progress and Done): add, edit, delete and drag cards, or move them from a card's menu on phones, and a `#label` shows as a tag. Saving changes only that card's lines, and a project without PROGRESS.md gets a "Start a board" button.
- New project makes a folder in your projects folder with git, a starter CLAUDE.md and an empty board, and offers "Have Claude set it up", which opens a new session with /init.
- Add context: drop text files on a project page, or pick them, to copy them into its docs/ folder. Each file has a "Claude reads this every session" switch that adds or removes its `@docs/…` line in CLAUDE.md.
- The project page is now a summary: the board, Up next, how many instructions, skills, agents, hooks and so on the project has (each opens that page filtered to the project), recent sessions, context files, changelog, docs and .worktreeinclude.
- A Settings page for permission rules, model, environment variables, status line, sandbox, keyboard shortcuts and themes, for every project, a project's shared settings or your own settings for it. It shows which file's value is in effect when more than one sets it, has "Edit as text" for each file, and hides environment variable values until "Show value".
- Each project page has "Build your setup": a card for instructions, skills, agents, hooks, MCP servers and output styles with how many the project has, one line saying what it is, and a New button that creates it in that project. Home no longer has setup cards.
- Home has one list of sessions (those that need you, those paused at a usage limit, then the 6 most recent), replacing the separate Background sessions, Projects and Changelog lists.
- A Sessions page lists every session in every project, newest first and background sessions included, with title search, a project picker, a "Needs you" filter and New session. An opened session is its own page with Back, and a background session opens full width with its state and what it did.
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

- A background session stopped by a usage limit more than a day ago shows as an ordinary session on Home and Sessions, in date order with Open and Continue, instead of a "Paused" row at the top that said the limit had since reset.
- Deleting a skill, agent, command, rule, output style, plan or memory note from a project page moves it to Archived items instead of the computer's trash.
- Opening a file to edit right after reading it no longer shows an empty editor.
- Home's "All sessions" link opens the Sessions page, and a project page's "Show all N sessions" opens it filtered to that project.
- Stopping or closing a live session returns to Sessions.
- Nothing sits in a second column beside the menu: the Customize pages and the Sessions list take the full width, and an item or session opens as its own page with a link back. Guides lists the guides as cards, and a guide opens on its own page.
- A project opens as one page with every section showing and a count for each, instead of tabs.
- Files open in place as readable text; Markdown is edited in live preview, so saving changes only what you typed.
- Skills and plugins are turned on or off from the item itself.
- Error messages say what went wrong and what to do, with Try again.
- Section titles name what each section holds, such as Recent changes, Running sessions and Needs your attention.

### Removed

- The sentence under Home's heading.
- The Setup page. Its skills, agents and other lists are on the Customize pages, its settings on Settings; /setup opens Settings and /library opens Customize.
- The command palette and its hidden keyboard shortcuts.
- The separate Sessions, Live, Jobs, Library, Settings and Map menu entries. Old links land on the pages that replaced them: /jobs and /live open Sessions, /map opens Customize, and an old Library link to one kind of item, such as agents, opens that kind's page.
- The File locations page (/map).

### Fixed

- The Control Center window keeps working when you turn home network mode on or off from it, instead of going unresponsive until the app is reopened. If the window's local address can't be opened, it says so instead of staying blank.
- Guides show lists, tables and bold lines inside the docs' tabs as formatted text instead of raw code, and a code block inside a list item no longer swallows the text after it.
- The "How to write a good one" guide on the New forms folds under the form below 1280 px wide, so phones and tablets can read it too, and sits beside the form from 1280 px.
- After creating something for one project, the app opens that feature's page filtered to the project, instead of the project page, which no longer lists those items.
- Deleting an open item no longer reports errors in the browser console while its view closes.
- Archived items on a phone show each name on one line, with the date and Restore below.
- The browser console no longer shows "Encountered a script tag while rendering React component" on every page.
- Cancelling "Delete this session?" no longer leaves the session page.
- Home no longer says background sessions need you when they only stopped at a usage limit that has since reset.

## [0.1.0] - 2026-10-17

### Added

- First version: your Claude Code projects, sessions, skills, agents, settings and background sessions in one place, with safe editing that keeps a backup and refuses to overwrite a file that changed since you opened it.
- Start, continue and answer Claude sessions from the app.
- Runs as one program on macOS, Linux and Windows, on this computer only or on your home network with a password.
- A Library of skills, agents, commands, rules, output styles, hooks, settings files, CLAUDE.md files, plans, memory notes and plugins, for every project or one. Select many at once, filter to those unchanged for a number of days, and archive or delete them together.
- A Hooks view listing every hook in your user, project and local settings; opening one opens its settings file at that line.
- A Map of every file and folder Claude Code uses, with the order its settings files rank in and a preview of each folder.
- Skills are checked with skills-ref before saving, with Keep editing or Save anyway when the check fails.
- Search everything with Cmd+K, and save a note from it to FEEDBACK.md.
- Press e to start editing the open file.
- Long transcripts load as they stream in and page through, and search finds Claude's replies too.
- Single-file builds for each platform, with install steps in the README and test steps for Windows.

### Changed

- The interface uses shadcn/ui components, with light and dark themes.

### Fixed

- Turning home network mode on or off now restarts the app as it should.
- Commands whose frontmatter strict YAML rejects, such as `argument-hint: [name] [--project | --personal]`, show their descriptions and can be saved again.
- Project tabs wrap on phones, and long paths no longer squeeze Home's cards.
- The single-file build finds the installed Claude Code even when it isn't on the shell's PATH.

### Security

- `~/.claude.json`, which holds account details, is never read through the app.
- Login attempts are limited by the connection's real address, so a faked header can't get around the limit.
