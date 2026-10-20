# Progress

Where Control Center stands, for whoever picks it up next. Read this first; update it after each finished item.

## Done

- [x] Desktop window that survives home-network switching #desktop
- [x] Desktop window in home-network mode #desktop
- [x] Desktop app in Applications #desktop
- [x] Desktop window #desktop
- [x] One column beside the menu #design
- [x] Final check of 57 pages, with its fixes #check
- [x] Old addresses redirected #sessions
- [x] Sessions page #sessions
- [x] Home with Build your setup and one session list #design
- [x] Settings page #settings
- [x] Project board, New project and Add context #projects
- [x] Plugins page #customize
- [x] Agent memory, keyboard shortcuts, themes and .worktreeinclude readers #customize
- [x] Customize feature pages #customize
- [x] Menu with Projects and Customize groups #design
- [x] Checkpoint commit of the 18 Oct overhaul #process
- [x] Menu cut to Home, All projects, Guides and the projects #design
- [x] One page per project and an All projects page #projects
- [x] Readable file views and live-preview Markdown #design
- [x] Create forms with the official guide beside them #customize
- [x] Slash command list, menu search and Guides page #sessions
- [x] Version 0.1.0 #release

## Waiting for John

Things done or skipped while John was away on 2026-10-18, for him to check. Each says what to do if he disagrees.

- **Done by the step 2–3 agent without asking (all reversible, commit 7b2badb):**
  1. Delete on the project and Setup pages now moves items to Archived items instead of the computer's trash, because they share one component with the new pages.
  2. Deleting a CLAUDE.md or a hook script is now allowed and archives it as a file. Before, the project page didn't offer delete for those.
  3. On Slash commands, "Run in a new session" starts the session in the item's own project when it belongs to one.
- **The dev server gets stopped every few minutes under `bun run dev`.** Something sends it a stop signal and Vite goes down with it. Cause not found yet. Running the server and Vite as two separate processes stays up.
- **Backup copies of the agent's test files** are in `~/.config/control-center/backups/2026-10-18/projects/claude-test/`. The agent's attempt to delete them was blocked by the permission check, so they were left in place. Delete that folder if you want it gone.
- **Step 4 choices (all reversible):**
  1. Agent memory shows on the Memory page as memory notes tagged "Agent: <name>", with the project it belongs to, or "All projects" for `~/.claude/agent-memory/`. If you'd rather see it with Agents, move kind "memory" items that have `meta.agent` to the Agents page in `web/src/lib/features.ts`.
  2. Notes in `.claude/agent-memory-local/` (Claude Code's "local" scope, not shared through git) are listed too, with `meta.scope` "local" but no tag saying so. Say if they should be marked "Only you".
  3. Keyboard shortcuts and themes come with every `GET /settings` reply, even when it's for one project, because they only exist for all projects. `.worktreeinclude` comes with `GET /projects/:id`. Settings shows keyboard shortcuts and themes; the project page shows `.worktreeinclude`.
  4. Changes in `agent-memory/` now refresh memory views, and changes to `keybindings.json` or `themes/` refresh settings views, by the file watcher (`server/src/fs/watch.ts`).
- **Step 5 choices (all reversible):**
  1. Removing a plugin you made with "New plugin" (`<name>@skills-dir`) moves its folder to Archived items instead of running `claude plugin uninstall`. The docs only say "delete its directory" or disable it; they don't say uninstall works for these. If you'd rather it were deleted for good, change `removeSkillsDirPlugin` in `server/src/api/content.ts` to use `trashItem`.
  2. Removing one also deletes its `"<name>@skills-dir"` key from `~/.claude/settings.json`, so no stale on/off entry is left. Restoring it from the archive brings it back turned on.
  3. "Open the new plugin's folder" opens the new plugin on the Plugins page, with its files listed (each opens readable and editable) and an "Open folder" button for Finder. It doesn't pop Finder open by itself. Say if you want Finder to open on its own after creating.
  4. Only plugins in `~/.claude/skills/` are listed, not ones in a project's `.claude/skills/`. Turning a project one on or off needs that project's folder; add it if you keep plugins there.
  5. Install always installs for you in every project (Claude Code's default user scope); there's no scope picker. Uninstall also uses user scope, so a plugin installed only for one project gets Claude Code's "not installed at that scope" message.
  6. A plugin whose marketplace runs an install command (Claude Code asks "Run this command now?") fails from the app with Claude Code's message, because the app doesn't pass `-y` or `--accept-command`. Install those from a terminal.
  7. "Find plugins" also names marketplaces with nothing left to install (yours: ponytail · 0), from `claude plugin marketplace list --json`.
  8. The `/library/plugin` endpoint, which wrote `enabledPlugins` into settings.json itself, is deleted; on/off now goes through Claude Code.
  9. The plugin id check is stricter: only `name@marketplace` with each part starting with a letter or number. The old check let `--all` through, which would have turned off every plugin.
- **Step 6 choices (all reversible):**
  1. Board columns are only the `## Next`, `## In progress` and `## Done` sections of PROGRESS.md (any letter case). Everything else, such as "Waiting for John" and "Notes", isn't shown and is never changed. To count other names, add them to `columnOf` in `server/src/parsers/board.ts`.
  2. A card is a top-level list item plus the indented lines under it; moving or deleting a card takes those lines along.
  3. Moving a card into Done ticks its checkbox; moving it out unticks it. A new card copies the column's style (checkbox, number); numbered cards continue from the highest number on the board.
  4. A moved card goes to the end of its new column. Cards can't be reordered within a column; say if you want that.
  5. If PROGRESS.md lacks a column's section, the first card added or moved there creates it at the end of the file.
  6. When a column's only card leaves, the blank line above it goes too, so an emptied column looks as it did before.
  7. The old backlog editor on the project page now only edits a BACKLOG.md; PROGRESS.md is edited through the board.
  8. New project only makes folders directly inside a project folder from App preferences (`~/projects`), because that's how the app finds projects; other folders are refused with that reason. The other way would be to remember extra project folders in the app's config.
  9. A new project's name is letters, numbers, dots, dashes and underscores, without spaces.
  10. "Have Claude set it up" opens the New session form with /init filled in, the way `/live?new=1&project=…&prompt=/init` works today; you press Start.
  11. Add context takes text files only, up to 2 MB each (the editor's limit). safeWrite writes text, so a PDF, image or Word file would be damaged; they're refused with "save it as Markdown or text first". File names are cleaned to letters, numbers, dots, dashes and underscores (spaces become dashes), so the `@docs/…` line needs no escaping. A name already in docs/ is refused, not overwritten.
  12. The switch writes to the root CLAUDE.md, or to `.claude/CLAUDE.md` when only that exists (then the line is `@../docs/…`, since the docs say paths resolve from the importing file). It adds the line at the end of the file and removes only lines that hold just that import. If the import sits inside a sentence, it says which line to edit instead of rewording it.
  13. Recent sessions shows 5, then a "Show all N sessions" link to `/sessions?project=<id>`.
  14. The counts leave out Slash commands (it repeats Skills), Plugins and Scheduled tasks (they never belong to one project). They come from `/catalog`, which only covers projects in your project folders, so a project found only through its sessions shows 0.
  15. Removed from the project page: the Plans, CLAUDE.md, skills, agents, commands, hooks, rules, memory, MCP and settings sections, and the "On this page" list beside them. The counts link to those pages instead.
  16. Up next shows the first 5 Next cards; without a board, a BACKLOG.md's open items; without either, 5 unfinished plan steps and a link to the project's Plans page.
  17. `~/projects/control-center` (on branch main) has no PROGRESS.md, so its page shows "Start a board". It wasn't pressed.
- **Step 7 choices (all reversible):**
  1. `/setup` redirects to `/settings` and the Setup page is deleted. `/library` now redirects to `/customize` (it went to `/setup`, which would now land on Settings). To change either, edit the redirects in `web/src/router.tsx`.
  2. After creating something for all projects from a New form, the app opens that thing's Customize page (a permission rule opens Settings) instead of a section of Setup. File locations links open the Customize page filtered to the project, or Settings. These are in `NewItem.tsx`, `AddSetting.tsx` and `Map.tsx`.
  3. `GET /settings` no longer sends environment variable values, only names; "Show value" fetches one value from `GET /settings/env-value`. Hidden again on "Hide" and not kept in the browser's cache.
  4. Model offers the aliases from the model docs (sonnet, opus, haiku, fable, best, sonnet[1m], opus[1m], opusplan) plus any full model name. The `default` value isn't offered; "Not set" removes the key, which gives the same account default.
  5. Sandbox covers four switches (sandbox on, run sandboxed commands without asking, let Claude retry outside the sandbox, refuse to start without it) and six lists (commands outside the sandbox, extra write places, no-write places, no-read places, allowed websites, blocked websites). The rest (credentials, proxy ports, Unix sockets and so on) is changed with "Edit as text". Add a field to `SANDBOX_FLAGS`/`SANDBOX_LISTS` in `server/src/parsers/settingsEdit.ts` and the page to show more.
  6. Themes also sets which theme Claude Code uses (`theme`: the 7 built-in themes or your own as `custom:<name>`), not only lists your theme files.
  7. Switches and the theme save as soon as you change them; text fields have a Save or Add button. Removing a permission rule, variable, list entry or shortcut doesn't ask first (each save makes a backup).
  8. Keyboard shortcuts accept only the 27 contexts and 137 actions the keybindings docs list, copied into `server/src/parsers/keybindingDocs.ts`; the keys the docs say can't be rebound (ctrl+c, ctrl+d, ctrl+m, ctrl+[, ctrl+i, ctrl+h) are refused, and keys are saved in lower case. Remove deletes your entry so Claude Code's default comes back; "Unbind" saves `null` to turn the default off. When Claude Code adds actions, update that file from the docs page.
  9. A settings change to a file that isn't valid JSON is refused with the line that's wrong and "Fix it as text first". This also applies to adding a permission rule or hook, which used to fail with a general error.
  10. Saving the status line writes `type`, `command` and only the optional fields you filled in, replacing the whole `statusLine` entry in that file.
  11. Keyboard shortcuts show no scope picker: the docs say they exist only in `~/.claude/keybindings.json`.
- **Step 8 choices (all reversible, in `web/src/pages/Home.tsx`):**
  1. The docs' "install a code intelligence plugin" row has no page of its own in the app, so its card's button is "Find plugins" (the Plugins page's Find panel, with an empty search box) and its link is "Open Plugins". The other choice was linking to the code intelligence guide on the docs site; change that card's `create` in `SETUP` if you prefer it.
  2. The "package it as a plugin" row's button is "New plugin" (the Plugins page's New panel), because the Plugins feature has no New form of its own.
  3. Both skill rows ("same prompt to start a task" and "same procedure for the third time") open the same New skill form.
  4. Removed from Home: the Active sessions, Background sessions (with its state counts), Projects and Changelog lists, and the "Copy resume command" button on background sessions that need you (Answer and Open remain). Running sessions show in the one list tagged "Running". `GET /overview` no longer reads every project's CHANGELOG.md. To bring a list back, restore it from commit 19c7deb.
  5. Home's heading is "Control Center", not "Home", so the first thing on the page names the app; the tab and phone top bar still say Home.
  6. The session list sits below the nine cards, as the plan orders them. On a phone that is about 2,200 px down, so a session that needs you is out of sight (the menu's count still shows it). If you want it first on phones, move `<SessionList>` above the "Build your setup" section.
- **Step 9–10 choices (all reversible, in `web/src/pages/Sessions.tsx`, `web/src/components/SessionRows.tsx` and `web/src/router.tsx`):**
  1. Background sessions are in the one list. A transcript that belongs to one takes its name, is marked "Background" and opens its page (state, timeline, "Open transcript"). Background sessions whose transcript isn't listed (8 of 23 here) get a line of their own. Home's list works the same way, so its background lines now open that page instead of the transcript. To open the transcript instead, change the Open link in `SessionRow`.
  2. Lines that need you come first, then everything newest first; ones paused at a usage limit sit in time order, tagged Paused. Home keeps its order (needs you, paused, 6 most recent).
  3. The project picker lists the projects that have sessions, plus "Not in a project" for sessions run elsewhere (such as in `~/projects`). Search matches title words only; the menu's search box covers what was said.
  4. Filters are in the address: `?project=<id>&needs=true&q=<words>`. The old `?archived=` is gone, so archived sessions can't be listed anywhere (they couldn't before this step either). Say if you want an "Archived" switch; `GET /sessions?archived=1` already exists.
  5. Each line shows the project's name, or the folder's name outside a project. Before, sessions in a worktree showed the worktree's folder ("design-overhaul").
  6. Deleting a session returns to Sessions (it went to the project page or Home). Stopping or closing a live session returns to Sessions (it went to the New session form).
  7. `/map` isn't linked from anywhere since the menu changed, so it redirects to Customize and `web/src/pages/Map.tsx` is deleted; restore it from commit af46444. `GET /map` still sends the `groups` list nothing reads now; Settings uses only its `precedence`.
  8. Plain `/live` and `/jobs` open Sessions. `/live` with a project, prompt or session to resume is still the New session form. `/library?kind=<kind>&scope=<project>` opens that kind's Customize page filtered to the project; plain `/library` opens Customize.
  9. Archived items (`/archive`) works, but nothing links to it since the step 2 menu, though delete messages point there. It isn't added to the menu because the plan doesn't list it. Say where you want the link (menu, App preferences, or the Customize overview).
  10. `TwoPane`, `ListGroup` and the pane registry in `web/src/components/Panes.tsx` were used only by the old background-session list and are deleted. The `react-resizable-panels` package is now unused but still in `web/package.json`, since removing it changes the lockfile; run `bun remove react-resizable-panels` in `web/` to drop it.
  11. The "Encountered a script tag while rendering React component" console error came from next-themes: its ThemeProvider renders an inline script meant for server-rendered pages, and React 19 reports any script element it renders in the browser. It never ran here; `public/theme-init.js` does that job before the first paint. Fixed by marking it as data (`scriptProps={{ type: "application/json" }}` in `web/src/components/ui.tsx`), which React doesn't report. The console was clean on every page checked.
- **Final check choices and differences from the plan (2026-10-19, all reversible):**
  1. After creating a skill, agent, rule, hook or other item for one project, the app opens that feature's Customize page filtered to the project (a permission rule opens Settings for that project). It used to open the project page at a section that no longer exists. Change it in `NewItem.tsx` and `AddSetting.tsx` (`onSuccess`) if you want somewhere else.
  2. Deleting a hook or an MCP server takes it out of its settings file and keeps a backup copy, but it doesn't appear in Archived items, so it can't be restored from there. The plan says every Customize page's Delete goes to the archive. Making these restorable means archiving settings entries, not files; say if you want that.
  3. Slash commands lists Claude Code's own commands from what the last session reported, not from the commands reference page. Plugin commands and MCP prompts show only if that session reported them, and then they're tagged "Built into Claude Code". Say if you want the list taken from the docs page and plugin/MCP commands tagged by source.
  4. Guides has no links to what's out of scope (cloud routines, Code Review on GitHub, Slack, gateways, organisation-managed settings, the Agent SDK), which the plan says it should link to. Add them to `GUIDES` in `server/src/api/guides.ts` or as plain links on the Guides page.
  5. Plans weren't edited or deleted in the check: a plan can only be made by running a session, and none was run. One was opened read-only and looked right. "New plan" opens a New session form; it wasn't pressed.
- **Skipped until you're back:**
  - the cka-prep and sharepoint backlog move (it deletes files in other projects);
  - installing or uninstalling a real marketplace plugin (only tested on Claude Code's documented output);
  - creating a scheduled task for the Desktop app (it needs a test with the app open).

## Desktop app

Plan: `~/.claude/plans/how-is-this-so-swirling-hopcroft.md` (Electrobun, approved 2026-10-19). One step per session.

- [x] D1. Control Center opens in its own window (2026-10-19). `bun run desktop` builds the web app, then `electrobun dev` builds `build/dev-macos-arm64/Control Center-dev.app` and starts it. `electrobun@2.0.4` is a pinned dev dependency; its first run downloaded Hutch 0.28.1 into `~/.hutch` (about 210 MB) and generated `.hutch/devkit` in the repo. `.hutch/`, `build/` and `artifacts/` are in `.gitignore` (the Hutch guide says `.hutch/` is generated and not to be committed; `build/` and `artifacts/` are Electrobun's default output folders). Files: `electrobun.config.ts` (app name, identifier `local.control-center`, Bun main process, copies `web/dist` into the app), `src/bun/index.ts` (the entry point), `tsconfig.json` (types for those two; it maps `electrobun` and `electrobun/main` to `.hutch/devkit` itself because the devkit's own tsconfig sets `baseUrl`, which TypeScript 7 rejects). The entry point exits if something already answers on http://127.0.0.1:4317, otherwise hands the copied web app to the server as `__CC_ASSETS`, sets `PORT=4317`, calls `main()` and opens a 1440 x 900 window on the server. Electrobun bundles the entry into one file, so the Agent SDK can't find its own Claude Code: `server/src/live/sessions.ts` now uses the installed `claude` whenever `__CC_ASSETS` is set, as the compiled executable already did. Tested: typecheck, 153 tests and build pass. In the window, Home, Sessions, Skills, a skill opened, Settings, Guides, a guide and a live session (one prompt in claude-test) in light and dark at 1352 px (the widest window this screen fits) and 1024 px, compared with Chrome at the same sizes: they look the same. A command was edited and saved from the window, the file on disk changed, and then the original bytes were put back. Closing the window, and quitting through macOS, stops the server (4317 free) and the live session's `claude` process. Starting a second copy of the app process exits with "already running" and leaves one server; opening the .app again through macOS brings the running app to the front with no second process. Differences from Chrome: the window keeps its own browser storage, so theme and which menu groups are open start fresh and don't follow Chrome; dev builds show the app as "bun" in the Dock and app switcher.
- [x] D2. Control Center as an app in Applications (2026-10-19). `bun run app` builds the web app, runs `electrobun build --env=stable` (output `build/stable-macos-arm64/Control Center.app`, plus a DMG and update files in `artifacts/`) and `scripts/install-app.ts`, which on macOS replaces `~/Applications/Control Center.app` with the new build (elsewhere it prints where the build is). The release .app is Electrobun's self-extracting wrapper: its first launch shows a "Control Center Setup — Installation complete" window and unpacks the full app in place (and `~/Library/Application Support/local.control-center/stable/` gets `self-extraction/` and `uninstall`), so every `bun run app` brings that window back once. Icon: `assets/icon.iconset/` (10 PNGs rendered from `web/public/favicon.svg` with `sips`), used for macOS; Windows and Linux use its 1024 px PNG, as the Application Icons page allows. Menu (Application Menu page, roles only): Control Center > Quit; Edit > Undo, Redo, Cut, Copy, Paste, Select All; Window > Minimize, Close. Address: `server/src/index.ts` now exports `serverAddress()` (port from `PORT` or config; https://localhost in home-network mode, else http://127.0.0.1), used by the server itself and by `src/bun/index.ts` for both the window and the already-running check (that check skips certificate verification, since the certificate is self-made). `bun run typecheck` now also runs `scripts/typecheck-desktop.ts` (tsc on `tsconfig.json`: `src/bun` and `electrobun.config.ts`), or prints "desktop code not checked: run `bun run desktop` or `bun run app` once first" when `.hutch/devkit` is missing (both cases tried; a planted type error fails it). README now starts with "Open Control Center from Applications", then `bun run app`, development, and "Single file for another computer". Tested: typecheck, 153 tests and build pass; `bun run app` installed the app; `open -a "Control Center"` started it from `~/Applications` (macOS registers it as "Control Center", bundle id `local.control-center`, executable `bun`; the menu bar shows Control Center, Edit, Window, and the Dock shows the icon), and the window showed the redesigned Home. Launching again only brought it forward (one listener on 4317); a second app process started by hand exited with "already running" in both modes. Quitting through macOS (the quit Apple event, the same command as the Quit menu item) left nothing on 4317, no app processes and no new `claude` processes. Window, menu, second launch and quit were tested with `CC_HOME` and `CC_APP_DIR` pointing at a throwaway folder, because the first launch with the real home stopped at macOS privacy prompts (below). Home-network mode, with a throwaway `config.json` (`lan.enabled: true`): the server listened on all addresses with https, the app checked https://localhost:4317 correctly, but the window stayed blank: the macOS web view refuses the self-made certificate. Not tested: clicking the menu items and Cmd+Q/C/V/Z (needs Accessibility access); quitting with a live session running (tested in D1).
  - **Waiting for John:** (1) The first real launch showed two macOS prompts, "launcher would like to access files in your Documents folder" and "launcher wants to access files managed by iCloud Drive" (projects in `~/Documents`, `~/Desktop` and iCloud Drive). They are still on screen, unanswered; the window doesn't open until they are answered, because the server reads those folders before the window opens. The app is signed only ad hoc and macOS names it "launcher", Electrobun's own launcher program, which is the same file in every Electrobun app. (2) `dist/control-center-darwin-arm64`: delete or keep.
- [x] D3. The window works in home-network mode (2026-10-19), as John decided: this computer's window uses plain http on 127.0.0.1 only; other devices keep the https address with the password. `server/src/index.ts`: in home-network mode `listen()` also starts a second listener on 127.0.0.1 at the main port + 1 (4318 for the app), started and stopped with the main one on start, mode change and restart (`startServer()` / `stopServer()`, both exported). Its requests go through the same guard as the main listener (a request from 127.0.0.1 skips the login, as it already did on the https address); on top of that it refuses any request whose Host isn't localhost, 127.0.0.1 or [::1], so a web page can't reach it by pointing its own name at 127.0.0.1 (the https address is protected from that by its certificate). If that port is taken, the error is logged and the main listener still runs. `serverAddress()` now also returns `localPort` and `localUrl` (http://127.0.0.1:4318 in home-network mode, else the same as `url`); `src/bun/index.ts` opens the window and does the already-running check on `localUrl` (no certificate skip needed any more). README sentence about the blank window removed. Test in `server/test/api.test.ts` ("listeners in home-network mode", real listeners on a random port): the local listener answers 127.0.0.1 without login, refuses a foreign Host, isn't reachable on this computer's network address; the https listener answers 401 from the network address, 200 after login, 200 from 127.0.0.1; after turning the mode off the local listener is gone. It is skipped on a computer with no network address. Tested: typecheck, 154 tests and build pass. `bun run desktop` with a throwaway `CC_HOME`/`CC_APP_DIR` and `lan.enabled: true`: listeners `*:4317` and `127.0.0.1:4318`, the window showed Home (screenshot); from the network address (10.0.0.142) 4318 refused the connection and https 4317 answered 401. Turning the mode off and on through `/api/lan` closed and reopened 4318; a second app process exited with "already running at http://127.0.0.1:4318". `bun run app` reinstalled `~/Applications/Control Center.app`.
- [x] D4. The window keeps working when home-network mode is switched (2026-10-19). Switching the mode from the window moved the window's address (4317 to 4318), so it stopped answering until the app was reopened. `server/src/index.ts`: the local-only http listener on 127.0.0.1 at the main port + 1 (4318 for the app) now runs in both modes, from `startServer()` until `stopServer()`; switching the mode swaps only the main listener (http on 127.0.0.1:4317 when off, https on all addresses when on), so the local one is never restarted. Its protections are unchanged (127.0.0.1 only, non-loopback Host refused, same guard). `serverAddress().localUrl` is always http://127.0.0.1:<port + 1>; `localListening()` says whether it started. If its port is taken, the log says "ERROR: Couldn't open http://127.0.0.1:4318 for this computer's window (is port 4318 taken?)" and the main listener still runs; `src/bun/index.ts` then opens the window with Electrobun's `html` option (documented on the BrowserWindow page as "HTML string loaded instead of `url`") showing "Control Center couldn't start its window" and which port to free, instead of a blank page. `bun run dev` and `bun run start` now also open 4318. Test in `server/test/api.test.ts` ("listeners"): with the mode off both listeners answer; switching on and then off through `/api/lan` on the local listener leaves it answering each time, the https listener needs the password from the network address, and stopping closes both. Tested: typecheck, 154 tests and build pass. `bun run desktop` with a throwaway `CC_HOME`/`CC_APP_DIR`: listeners 127.0.0.1:4317 and 127.0.0.1:4318; after switching on through `/api/lan` (4317 became `*:4317`, 4318 unchanged) and after switching off again, a project added to the throwaway home appeared in the window's menu by itself, so the window kept loading data both times (screenshots). With 4318 held by another program the window showed the message (readable in dark mode). `bun run dev`: 5317 served the page and proxied `/api` to 4317. `bun run app` reinstalled `~/Applications/Control Center.app`.

## In progress

Plugin facts checked against the live docs on 2026-10-18 (plugins/cli-reference, loading, create): every plugin command exits 0 or 1; with `--json`, install, uninstall, enable and disable print one object on the last line of stdout with `command`, `outcome` ("ok"/"failed") and `message`, plus `failureCode` when it applies; enabling an enabled plugin exits 1 with `failureCode: "already_in_goal_state"` (the app treats it as done); a usage error prints no JSON, only stderr; `--json --available` entries have `pluginId`, `name`, `marketplaceName`, `source`, `description`, `version`, `installCount`; `claude plugin init` takes `--with skills|agents|hooks|mcp|lsp|output-style|channel` and writes `~/.claude/skills/<name>/` with `.claude-plugin/plugin.json` and a root `SKILL.md`; a skills-dir plugin is stopped by deleting its folder or `claude plugin disable <name>@skills-dir`, and its on/off follows the manifest's `defaultEnabled` unless a settings file sets the id. Seen on this computer (v2.1.302): `init` prints an author warning before "Created plugin" when git has no user.name, and turning a skills-dir plugin back on removes its key from settings.json.

Import facts checked against code.claude.com/docs/en/memory on 2026-10-18: `@path` imports load at launch with the CLAUDE.md; relative paths resolve from the file holding the import; up to four hops of nested imports; a space in a path is written `\ ` (quoted paths aren't imported); imports inside code spans and fenced code blocks don't count; an import outside the working directory needs a one-time approval per project, while `docs/` inside the project doesn't; a CLAUDE.md over 4 MiB is skipped, and each import counts as a separate file toward the length warnings.

Facts checked against the live docs on 2026-10-18: plugin commands take `--json`; `claude plugin list --json --available` prints one pretty-printed object (about 3,800 plugins, 2.2 MB, so it's cached for 10 minutes); `claude plugin init <name>` creates `~/.claude/skills/<name>/`; MCP servers live in `~/.claude.json` (user, and local under `projects[path]`), in `.mcp.json` (project), and in a plugin's `.mcp.json` or `plugin.json`; workflows are `.js` files with `export const meta = { name, description }`; Desktop scheduled tasks keep only name, description and prompt in `~/.claude/scheduled-tasks/<name>/SKILL.md`. Before building "create a scheduled task", test whether the Desktop app picks up a folder the app makes, and ask John if it doesn't. Agent memory lives in `~/.claude/agent-memory/<agent>/` (scope `user`), `.claude/agent-memory/<agent>/` (`project`) and `.claude/agent-memory-local/<agent>/` (`local`), with `MEMORY.md` as the index; `keybindings.json` and `themes/*.json` exist only in `~/.claude`; a theme is `{ name, base, overrides }`; `.worktreeinclude` sits at the project root and uses .gitignore syntax.

Settings facts checked against the live docs on 2026-10-18 (settings-reference, settings, permissions, sandboxing, statusline, keybindings, model-config): files rank managed, then `--settings` on the command line, then `.claude/settings.local.json`, `.claude/settings.json`, `~/.claude/settings.json`; lists such as permission rules combine across files; `env` applies per variable from the highest file that sets it; rules are checked deny, then ask, then allow; a project's allow rules apply only after the workspace trust dialog; `statusLine` is `{ type: "command", command, padding?, refreshInterval? (1 or more), hideVimModeIndicator? }`; `theme` is auto, dark (default), light, dark-daltonized, light-daltonized, dark-ansi, light-ansi or `custom:<slug>`; keybindings.json is `{ $schema?, $docs?, bindings: [{ context, bindings: { keys: action | null } }] }`, and `null` unbinds a default.

## Next

- [ ] Headings without explainer sentences #design
  As John, I want every page, section and card to have a name for a heading and no sentence explaining it, so that pages read like any web app.
  - [ ] AC: `Page` and `DetailHeader` in `web/src/components/Panes.tsx` have no `sub` prop; a `meta` prop takes only facts (a path, a branch, a model, a count), and the 7 pages that passed `sub` (Home.tsx:104, Settings.tsx:728, Archive.tsx:45, Feature.tsx:450, Guides.tsx:51, NewProject.tsx:73, Live.tsx:266) show no sentence under their title.
  - [ ] AC: `intro` is gone from `web/src/lib/features.ts` and from `Feature.tsx:325` and `Feature.tsx:462`; the Customize cards show the icon, name and count only.
  - [ ] AC: the explainer paragraphs under section headings are deleted: Home.tsx:120 ("Build your setup"), ProjectBoard.tsx:99, Settings.tsx:165 and :671 and the other Settings section paragraphs, Projects.tsx:177, Sessions.tsx:106, PluginPanels.tsx "Searching 3 marketplaces…", the item header's "Comes from your claude.ai account…" line, and the "Context for Claude" paragraph on the project page.
  - [ ] AC: a new test in `server/test/wording.test.ts` fails when a sentence ending in "." sits directly under a heading or is passed as `meta`; it passes on the app and fails on a planted example.
  - [ ] AC: the rule "Each page opens with one plain sentence saying what it's for." is deleted from `.claude/work/001-usability-overhaul/plan.md:17`.
  - [ ] AC: screenshots of every page at 390 and 1440 px, light and dark, show no heading followed by a sentence explaining it.
- [ ] Home setup cards #design
  As John, I want the Build your setup cards on Home to all have the same parts and size, so that the panel reads as one even grid.
  - [ ] AC: `SETUP` in `web/src/pages/Home.tsx` has one entry per feature, with no feature twice (Skills and Plugins have one card each).
  - [ ] AC: every card has the feature's icon and name as its title, one line of at most about 8 words, and one button whose label is "New <thing>" (or "Find plugins" for Plugins); the separate "Open <feature>" link is gone.
  - [ ] AC: at 390, 768 and 1440 px every card in a row is the same height (checked in the browser with `getBoundingClientRect`).
  - [ ] AC: at 1440 px each card's line fits on one line.
- [ ] README as the app is now #docs
  As John, I want the README to describe the pages the app has today in short sections, so that I can read it at a glance.
  - [ ] AC: the "What's in it" table in `README.md:57-69` is replaced by one `###` heading per menu page (Home, Sessions, Projects, Customize, Settings, Guides), each with one or two short sentences.
  - [ ] AC: no deleted page (Live, Jobs, Library, Map, Archive as a menu page) is named, and no table is left.
  - [ ] AC: `README.md:71` (⌘K, `[` and `]`, dragging dividers) and `README.md:78` ("Delete moves it to the system trash") are corrected or removed, since the command palette, the list pane and the trash are gone.
- [ ] Board card story and criteria #board
  As John, I want to click a board card and read its story and acceptance criteria, ticking each one, so that I can follow a story's progress without "Edit as text".
  - [ ] AC: clicking a card in `web/src/pages/ProjectBoard.tsx` opens its indented lines rendered as Markdown.
  - [ ] AC: each `- [ ] AC:` line shows as a checkbox; ticking one changes only that line of PROGRESS.md.
  - [ ] AC: a round-trip test in `server/test/parsers.test.ts` ticks and unticks an AC line and leaves every other byte the same (CRLF and no-final-newline cases included).
  - [ ] AC: checked on the control-center board at 390 and 1440 px in light and dark.
- [ ] Drafts for typed text #design
  As John, I want what I type to still be there when I leave a page and come back, so that I never lose a long message.
  - [ ] AC: the session prompt box (`web/src/components/MessageBox.tsx`, used in `Live.tsx:98` and `Live.tsx:342`) keeps a draft per session in local storage.
  - [ ] AC: the New forms (`NewItem.tsx`, `AddSetting.tsx`, `NewProject.tsx`, New plugin in `PluginPanels.tsx`) keep a draft per form.
  - [ ] AC: unsaved edits in the file editor (`web/src/components/FileEditor.tsx`) and in a board card being edited (`ProjectBoard.tsx:159`, `:207`) survive leaving the page too.
  - [ ] AC: a draft clears when it's sent or saved.
  - [ ] AC: in the browser: type in each of these, go to another page, come back, and the text is still there.
- [ ] Board and changelog kept with every story #process
  As John, I want every finished story to update the board and the changelog, so that the board and the changelog are never empty again after days of work.
  - [ ] AC: the `breakdown` skill is edited after reading the three agentskills.io pages, and `skills-ref validate` passes on it.
  - [ ] AC: the skill says a story is done only when its card is in Done and CHANGELOG.md's Unreleased section has its line.
  - [ ] AC: the `verifier` agent fails a story whose card isn't in Done or whose changelog line is missing (tried on one planted failure).
- [ ] Choices made without John #process
  As John, I want to go through the roughly 70 "Waiting for John" items as clickable questions a few at a time, so that I decide them instead of agents.
  - [ ] AC: every item in PROGRESS.md's "Waiting for John" section is asked, a few per question.
  - [ ] AC: each answer is carried out or recorded where it applies.
  - [ ] AC: the "Waiting for John" section is then deleted from PROGRESS.md.
- [ ] Main's saved edits from 18 Oct #cleanup
  As John, I want the edits main had before the merge checked against the merged code, so that nothing I or an agent wrote is lost.
  - [ ] AC: `~/.config/control-center/backups/2026-10-20/main-uncommitted.patch` is compared file by file with main.
  - [ ] AC: anything in it that main lacks is listed for John, then applied as he decides.
  - [ ] AC: typecheck, tests and build pass afterwards.
- [ ] Merged worktree and branch removal #cleanup
  As John, I want the merged design-overhaul worktree and branch removed, so that only one copy of the app is left.
  - [ ] AC: John is asked first, because this deletes the build outputs in `.claude/worktrees/design-overhaul`.
  - [ ] AC: `git worktree list` no longer shows it, and `git branch` no longer shows `design-overhaul`.
  - [ ] AC: `bun run typecheck`, `bun run test` and `bun run build` pass on main afterwards.
- [ ] App preferences without removed features #design
  As John, I want App preferences to show only what the app still does, so that it doesn't point me at shortcuts and panes that are gone.
  - [ ] AC: the Keyboard shortcuts list (`web/src/pages/Preferences.tsx:31-38`) shows only shortcuts that work (⌘K, `[`, `]`, `/`, `e`, `g h` have no handler in `web/src`), or is removed.
  - [ ] AC: the pane-size sentence (`Preferences.tsx:158`) and the "Save feedback from the search box (⌘K)" sentence (`Preferences.tsx:97`) are gone, since neither feature exists.
  - [ ] AC: "Views opened" (`Preferences.tsx:106`) doesn't show internal names of deleted pages (jobs, library, map, setup, live).
  - [ ] AC: the "After a week of daily use" card below is changed to match, since feedback can no longer be saved from the app.
- [ ] Session list rows #design
  As John, I want every row in a session list to have the same parts and buttons, so that the lists on Home and Sessions look even.
  - [ ] AC: rows in `web/src/components/SessionRows.tsx` show the same buttons in the same places (now "Answer" alone, "Open" alone, or "Continue" and "Open", lines 116, 145-161).
  - [ ] AC: a session's title is never a cut-off raw prompt (seen: "user: The sidebar…", "ver and running the whole sweep again…", "both pages gone. Removing…").
  - [ ] AC: at 390 px, every row keeps its buttons on the same line as the others.
- [ ] Same left edge and width on every page #design
  As John, I want every page's title and content to start at the same place, so that moving between pages doesn't shift the layout.
  - [ ] AC: Projects (`web/src/pages/Projects.tsx:31`, its own 1100 px wrapper) uses `Page` like the other pages.
  - [ ] AC: an opened item, a New form and Find plugins (`Feature.tsx:318`, `NewItem.tsx`, `PluginPanels.tsx`) start at the same left edge as `Page` (now about 10 px further left at 1440 px).
  - [ ] AC: the empty state (`web/src/components/ui.tsx:69`, `md:pl-12`) lines up with its page's heading, as on Archived items.
  - [ ] AC: an item's Edit and Delete sit together (now Edit top right at `Feature.tsx:278`, Delete under the tags at `Feature.tsx:287`).
- [ ] Even cards on Projects and in lists #design
  As John, I want cards in a grid and rows in a list to have the same shape, so that pages look tidy.
  - [ ] AC: Projects cards (`Projects.tsx:35-40`) are the same height whether or not a project has a backlog line, and say "last session yesterday" instead of "last Yesterday".
  - [ ] AC: on Customize lists (`Feature.tsx`), the tags sit on the name's line at 390 px or always below it, the same for every row.
  - [ ] AC: the project header says "1 changed file" for one (`Projects.tsx:537`).
  - [ ] AC: checked at 390, 768 and 1440 px in light and dark.
- [ ] Project page without a second Next list #design
  As John, I want the project page to show the board's Next column once, so that the same cards aren't listed twice.
  - [ ] AC: "Up next" (`web/src/pages/Projects.tsx:557`) isn't shown when the project has a board, since it repeats the Next column.
  - [ ] AC: a two-digit numbered card ("10.", "11.") shows its whole number on the board (now clipped on the left at 1440 px).
- [ ] Readable tables in guides on phones #design
  As John, I want tables in guides to scroll sideways on a phone instead of breaking words into letters, so that I can read them.
  - [ ] AC: table cells in `.prose-cc` (`web/src/styles.css:205-208`, `overflow-wrap: anywhere`) break only between words; the table scrolls inside itself.
  - [ ] AC: the "What you can customize" guide at 390 px shows "Feature" and "CLAUDE.md" on one line each.
- [ ] Plugin files without Claude Code's lock files #design
  As John, I want a plugin's file list to show only its own files, so that it isn't cluttered.
  - [ ] AC: the Files list on a plugin (`web/src/pages/Feature.tsx:229`) leaves out `.in_use/` entries, which Claude Code writes while a plugin is loaded.
  - [ ] AC: the Manifest section shows nested fields such as Author with their own label, not a second "Name".
- [ ] cka-prep and sharepoint backlogs on the board #projects
  Move the cka-prep and sharepoint backlogs into their PROGRESS.md boards, and check the cka-prep board. Waiting for John, since it deletes files in other projects.
- [ ] Plan edit and delete check #check
  Edit and delete a plan from the Plans page in a real session's plan, which the 2026-10-19 final check didn't do.
- [ ] Home review with John #check
  Show John Home at 390 and 1440 px (`~/.claude/jobs/4537fe5b/tmp/home-390.png` and `home-1440.png`), or new screenshots once the Home cards story lands.
- [ ] Shared rules between the exercise projects #projects
  Share rules between the exercise projects (cka-prep, sharepoint) without moving them. Its own session, starting with research. Found so far: the style list is already copied into both (differs by one folder name); the cold-reader, style-reader and build-exercise skill assume Kubernetes and need rewording; the two copies of the study app already differ in 33 files; Claude Code asks once per project before loading an import from outside the project folder.
- [ ] Shared rules and plugins on each project page #projects
  Show on each project page what it gets from shared rules and plugins.
- [ ] Windows test #check
  Run the Windows test steps in docs/windows-test.md on a Windows PC.
- [ ] Feedback review after a week #process
  After a week of daily use, review Preferences > "How you use this app" and FEEDBACK.md.

## Notes

- No page puts a column beside the main menu. A list takes the full width and an item opens as its own page with a link back; only right-side panels (Settings' "On this page", the guide beside New forms) are allowed.
- Run the dev server as two processes (`bun src/index.ts` in server/, `bun run dev` in web/) for browser checks. Under `bun run dev` the server was stopped by SIGTERM every few minutes on 2026-10-18 and took Vite down with it; the cause wasn't found. On 2026-10-19 Vite was stopped the same way once even as a separate process; restarting it was enough.
- The browser check script must also flag sideways scrolling inside panes, not just the page: the first pass missed a select that pushed the item view wider than a phone.

- Projects aren't moved into each other: Claude Code files sessions and memory under the folder path, and git worktrees store absolute paths, so a move breaks both.
- The project page falls back to unfinished plan items only when a project has no PROGRESS.md or BACKLOG.md. It never shows commits as a changelog.
