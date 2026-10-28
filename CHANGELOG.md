# Changelog

Notable changes to Control Center, newest first.

## Unreleased

### Added

- Slash commands always lists Claude Code's own commands, such as `/compact` and `/init`, from the docs' command list, even before any session has run in Control Center. Each shows its purpose and what it takes (such as `<path>` for `/add-dir`) and is tagged "Built into Claude Code", or "Built-in skill" for bundled skills such as `/fewer-permission-prompts`, or "From MCP server <server>" for an MCP server's prompts. They stay listed when a project is picked in the filter, and the same list is offered when you type `/` in a conversation.
- Settings lists every setting from Claude Code's settings reference, one section per topic (such as "Interface and terminal" and "Remote, desktop, and notifications") below Themes, each with its description and its value now and the file that set it, or its default. "Find a setting" filters them by key or description. Each one can be changed in place, in the file picked in "Change settings for": an on/off switch, a choice, a number box, a text box, or one value per line. Turning it off or emptying it removes it from the file, except that a switch writes `false` when the setting is on by default or another settings file turns it on, so a project can turn off what your settings for every project turn on; every other line of the file stays as it was. Settings that can go only in your settings for every project are greyed out for a project, with a note saying so. A setting another section already edits links to that section; one that holds an object has "Edit as text", which opens its file at that key.
- Plans shows whether each plan was approved (Approved, Not approved or Draft) and the date it last changed instead of its file name. A plan's page lists the conversations that worked on it, newest first, and a conversation's page links to the plan it follows.
- Plans are tagged with the project their conversations ran in, so picking a project on Plans shows its plans. Plans in a project's own plans folder (`plansDirectory`) are listed too.
- Each project page has "Shared instructions and plugins": your instructions and rules for every project, and the plugins turned on in that project, each opening its own page.
- Agents lists Claude Code's built-in agents (Explore, Plan, General-purpose, claude, statusline-setup, claude-code-guide), tagged "Built in". One of your own agents with the same name hides the built-in one.
- Deleted hooks and MCP servers go to Archived items, where Restore puts them back: a hook into its group in the same settings file, a server through Claude Code's `claude mcp add-json`.
- A conversation open in another Claude Code window isn't sent into: a message sent from Control Center continues in a copy of it, with its own session, so the two don't mix into one transcript.
- Text you type is kept when you leave the page: a conversation's reply box, the New session box, and the New skill, command, agent, rule, output style, memory note, instructions, hook, permission rule, MCP server and project forms. It's still there when you come back, and goes once you send or save it.
- Guides has "In the cloud and your organization", with links to the official pages for cloud scheduled tasks (routines), Code Review on GitHub, Claude Code in Slack, gateways, organization-managed settings and the Agent SDK.
- On Memory, notes kept in a project's `.claude/agent-memory-local/` are tagged "Only you", beside "Agent: <name>".
- Archived items is in the menu, as the last link under Customize, and is the last card on the Customize page. The message after moving something to Archived items has an "Open Archived items" button.
- Home has a Suggested section under Sessions when you've typed the same prompt 3 or more times (capitals and trailing spaces ignored; slash commands and one-word prompts left out). Each shows how often you typed it and "Make it a skill", which opens New skill with the name and instructions filled in. A suggestion goes once a skill of that name exists.
- Settings opens with an Account section: how Claude Code signs in (Claude account, API key, Amazon Bedrock and so on), with the email, organization and plan. Pick a project under "Change settings for" to see the account Claude Code uses in that project.
- Sign in with a Claude account from Settings: open the Claude sign-in page, paste the code it shows, and the Account section updates. Claude Code's own message shows when a code is wrong. "Sign out" asks first. Both run Claude Code's `claude auth login` and `claude auth logout`, so the terminal uses the same login.
- Sessions started from Control Center show the account they run on (email and plan, or the provider such as Amazon Bedrock) in the conversation's header. The New session form shows the account the session will use. Sessions started in the terminal show none, because Claude Code doesn't record it.
- The Control Center window also works with home network mode on. It connects over a local-only address that other devices can't reach; phones and other computers still use the https address and the password.
- Control Center is an app in Applications: open it from there or from Spotlight, with its own icon, name and menus, and quitting it stops it. `bun run app` rebuilds and reinstalls it after code changes, and `bun run desktop` opens a development copy.
- A Customize section with one page for each thing that changes how Claude Code works: instructions, skills, slash commands, agents, hooks, MCP servers, plugins, plans, scheduled tasks, output styles, memory and workflows. Each page lists every item from every project and plugin, says where it applies, and has a search box, a project filter and a New button.
- Open any item to read it, edit it in place or delete it. Deleted files go to Archived items, where you can restore them.
- The Slash commands page lists Claude Code's own commands next to yours, each with "Run in a new session".
- The Memory page also lists the notes your agents keep for themselves (agents with `memory` set), tagged "Agent: <name>".
- The Plugins page turns each plugin on and off and uninstalls it, using Claude Code's own plugin commands and showing its message when it refuses. "Find plugins" searches every marketplace you have (about 3,800 plugins) with Install, and "New plugin" makes a starter plugin in your skills folder.
- Plugins you made in your skills folder show on the Plugins page. Removing one moves its folder to Archived items.
- The menu has Home, Sessions, Projects, Customize, Settings and Guides. On a phone it opens full screen; on tablets it's a strip of icons.
- Each project page opens on a board of its BACKLOG.md: every numbered line in Open, In spec or Done by its status, with a count on each column. A card shows the number, the idea cut to two lines (the full text shows on hover) and the verdict. A line in a spec lists that spec's steps from features.json, each marked Passing or Failing. The board can't be edited; Claude changes a line's status as the work moves. A project without BACKLOG.md shows three empty columns.
- Feedback in the menu on every page: type a note, pick the project (the one you're looking at, or All projects) and Save. It becomes a new pending, open line at the end of a Feedback table in that project's BACKLOG.md, or in `~/.claude/BACKLOG.md` for All projects, and shows "Added as #<n>"; nothing else in the file changes. A missing BACKLOG.md is made from the feature skill's template. A note you haven't saved is still there when you open Feedback again.
- New project makes a folder in your projects folder with git and a starter CLAUDE.md, and offers "Have Claude set it up", which opens a new session with /init.
- Add context: drop text files on a project page, or pick them, to copy them into its docs/ folder. Each file has a "Claude reads this every session" switch that adds or removes its `@docs/…` line in CLAUDE.md.
- The project page is now a summary: the board, how many instructions, skills, agents, hooks and so on the project has (each opens that page filtered to the project), recent sessions, context files, changelog, docs and .worktreeinclude.
- A Settings page for permission rules, model, environment variables, status line, sandbox, keyboard shortcuts and themes, for every project, a project's shared settings or your own settings for it. It shows which file's value is in effect when more than one sets it, has "Edit as text" for each file, and hides environment variable values until "Show value".
- Each project page has "Build your setup": a card for instructions, skills, agents, hooks, MCP servers and output styles with how many the project has, one line saying what it is, and a New button that creates it in that project. Home no longer has setup cards.
- Home has one list of sessions (those that need you, those paused at a usage limit, then the 6 most recent), replacing the separate Background sessions, Projects and Changelog lists.
- A Sessions page lists sessions newest first, background sessions included, with title search, a "Needs you" filter and New session. An opened session is its own page with Back, and a background session opens full width with its state and what it did.
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

- Control Center reads only `~/.claude` and the folders inside your Project folders. Folders where a conversation ran or that `~/.claude.json` names, such as Documents, Desktop, Mail or iCloud Drive, are no longer looked at, so macOS stops asking for access to them. Their conversations still show on Sessions.
- Every page's content starts at the same left edge and has the same width, including Projects and pages that scroll.
- Cards on Projects, a project's "Build your setup", Customize and Guides are all the same height.
- Every conversation has one page, at /sessions/<session id>: the whole conversation with tool calls folded into one line, Claude's approvals and questions as cards where it stopped, and a reply box at the bottom with the model and permission mode under it. Pressing Enter sends, whether Claude is working, finished, or the session was started in a terminal; Stop sits next to the box. "Show details" unfolds tool calls and thinking. "Copy command for the terminal", subagent runs, Archive and Delete are in the page's menu. The header names the conversation, its project and whether Claude is working, waiting for you or done. Old /live/<id>, /live?resume=<id> and /jobs/<id> links open this page.
- New session opens an empty conversation page at /sessions/new with the project, model and permission mode in the row under the reply box. The first message starts Claude on the same page, and the address becomes the conversation's own. Every New session button (Home, Sessions, a project page) opens it with the current project filled in, or the project you used last; /live opens it too.
- Sessions shows every conversation as the same row: its name (the one you set, Claude's title, or the first line of the first prompt, never starting with "user:"), the project and how long ago it was last active, with "Working" or "Waiting for you" only while that's true. Click a row to open the conversation. Runs from scripts (`claude -p`) stay hidden until you turn on "Show runs from scripts", and "Show archived" adds archived conversations marked Archived. Opened from a project page ("All sessions"), it lists only that project, with an "Every project" switch. The sentence under the heading and the project picker are gone. Home leaves out runs from scripts too.
- The main menu has "Continue last conversation", which opens the conversation you last sent a message in, from any page. Under it, "Needs you" and "Working" list the conversations waiting for an answer and the ones Claude is working in (up to 5 each, with a link to the rest). On tablets the strip of icons has "Continue" and a short line for each of those conversations.
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

- The project page's Up next list and its editable Backlog section; the board shows BACKLOG.md instead.
- The separate live session view and the "Resume a session" form, with the transcript page's "Only my messages" and "N prompts ↑↓" controls and its "Continue this session" button.
- The sentence under Home's heading.
- The Setup page. Its skills, agents and other lists are on the Customize pages, its settings on Settings; /setup opens Settings and /library opens Customize.
- The command palette and its hidden keyboard shortcuts.
- The separate Sessions, Live, Jobs, Library, Settings and Map menu entries. Old links land on the pages that replaced them: /jobs and /live open Sessions, /map opens Customize, and an old Library link to one kind of item, such as agents, opens that kind's page.
- The File locations page (/map).
- The explaining sentence under the headings of Customize and each of its lists, Settings, Archived items, Guides, New project and the New item forms.
- App preferences no longer lists shortcuts and features that are gone (⌘K, `[`, `]`, the other single-key shortcuts, dragging dividers, saving feedback from the search box) or the feedback file; it lists ⌘S (Ctrl S on Windows and Linux), which saves the open file.

### Fixed

- Empty pages (such as an empty Archived items) and the page for an old live-session link start at the same left edge as every other page.
- Pictures in Guides load. The page now allows images from mintcdn.com, the server the Claude Code docs use, and from nowhere else outside the app.
- An opened project, conversation, file or item starts its title at the same left edge, and puts its content in the same width, as the top-level pages.
- Opening New session from a link that fills in the prompt, such as "Have Claude set it up", no longer hides what you had typed there. The linked prompt goes in the box, your earlier draft shows above it with "Use it instead", and it's back in the box after you send the linked prompt.
- `<kbd>` keys in Markdown, such as the README's ⌘S, show as keys instead of raw tags. Other HTML still shows as typed.
- A project with one changed file says "1 changed file", not "1 changed files"; archiving one session says "It can still be resumed".
- A plugin's Files list no longer shows `.orphaned_at`, the marker Claude Code leaves in an old version's folder.
- Settings no longer lets the whole window scroll past the end of the page.
- The Projects list's "N open in the backlog" counts the Open lines of a BACKLOG.md made of tables, the same as the board's Open column.
- Tables in Guides, and in the guide beside a New form, no longer break words into single letters on a phone; a wide table scrolls sideways inside itself.
- A plugin's Files list leaves out Claude Code's `.in_use` lock files.
- A plugin's Manifest shows the author as one value under Author, not a second "Name".
- Card numbers on the project board, such as #113, stay on one line.
- Usage statistics in App preferences count sessions started and questions answered from a conversation page again.
- Stopping a new conversation within about a second of its first message, then sending, no longer fails with "No conversation found" and loses the message: the send waits for the transcript Claude Code is still writing.
- After a stop, the conversation no longer shows "No response requested." as Claude's reply.
- The Control Center window keeps working when you turn home network mode on or off from it, instead of going unresponsive until the app is reopened. If the window's local address can't be opened, it says so instead of staying blank.
- Guides show lists, tables and bold lines inside the docs' tabs as formatted text instead of raw code, and a code block inside a list item no longer swallows the text after it.
- The "How to write a good one" guide on the New forms folds under the form below 1280 px wide, so phones and tablets can read it too, and sits beside the form from 1280 px.
- After creating something for one project, the app opens that feature's page filtered to the project, instead of the project page, which no longer lists those items.
- Deleting an open item no longer reports errors in the browser console while its view closes.
- Archived items on a phone show each name on one line, with the date and Restore below.
- The browser console no longer shows "Encountered a script tag while rendering React component" on every page.
- Cancelling "Delete this session?" no longer leaves the session page.
- Home no longer says background sessions need you when they only stopped at a usage limit that has since reset.
- The Control Center window shows its pages right after launch instead of staying blank for about 20 seconds while the app set up a watcher on every file in your projects.

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
