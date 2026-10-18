# Progress

Where Control Center stands, for whoever picks it up next. Read this first; update it after each finished item.

## Done

- [x] Menu cut to Home, All projects, Guides and the projects by name; command palette and the Sessions, Live, Jobs, Library, Settings and Map menu entries removed (2026-10-18).
- [x] One page per project with every section showing, and an All projects page for what applies everywhere (2026-10-18).
- [x] Readable views for every file, and Markdown edited in live preview so saving changes only what was typed (2026-10-18).
- [x] Create skills, commands, agents, rules, output styles, memory notes, instructions, hooks, permission rules and MCP servers from forms with the official guide beside them (2026-10-18).
- [x] Slash command list in sessions, visible search in the menu, Guides page (2026-10-18).

## Waiting for John

Things done or skipped while John was away on 2026-10-18, for him to check. Each says what to do if he disagrees.

- **Done by the step 2–3 agent without asking (all reversible, commit 7b2badb):**
  1. Delete on the project and Setup pages now moves items to Archived items instead of the computer's trash, because they share one component with the new pages.
  2. Deleting a CLAUDE.md or a hook script is now allowed and archives it as a file. Before, the project page didn't offer delete for those.
  3. On Slash commands, "Run in a new session" starts the session in the item's own project when it belongs to one.
- **The Sessions menu entry shows Projects** until step 9 builds the Sessions page.
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
  13. Recent sessions shows 5, then "Show all N sessions" in place, because `/sessions` still sends you to Projects. Step 9 should link it to `/sessions?project=<id>`.
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
- **Skipped until you're back:**
  - the cka-prep and sharepoint backlog move (it deletes files in other projects);
  - installing or uninstalling a real marketplace plugin (only tested on Claude Code's documented output);
  - creating a scheduled task for the Desktop app (it needs a test with the app open).

## In progress

Reorganising the app around Claude Code's features. The approved plan is `~/.claude/plans/encapsulated-mixing-clarke.md`; follow it step by step. The 2026-10-18 overhaul is committed as 7412c68; work since then is in the "WIP" commit after it.

- [x] 1. Checkpoint commit.
- [x] 2. Shell and menu (2026-10-18): phone full-screen menu, 768–1279 px icon strip, 1280 px+ full menu with Projects and Customize groups. Checked at 390, 768, 1024 and 1440 px in light and dark: nothing runs off the screen or is clipped, and the menu scrolls as one piece.
- [x] 3. Feature pages (2026-10-18): `web/src/pages/Feature.tsx` draws all 12 Customize pages from `web/src/lib/features.ts` and `/api/catalog`, plus the `/customize` overview and a placeholder `/projects/new`. Item, filter and search sit in the URL. Delete goes through the shared `web/src/components/ItemActions.tsx` (archive, `/hooks/remove` or `/mcp/remove`; plugin and claude.ai items say they come with their source).
- [x] 4. Server (2026-10-18): `server/src/scan/catalog.ts` with `/catalog`, `/hooks/remove`, `/mcp/remove`, `/plugins/available?q=`, `/plugins/{install,uninstall,enable,disable}` and `/plugins-new`; the Slash commands page reads `/live-commands`. Readers in `server/src/scan/library.ts`: agent memory from `~/.claude/agent-memory/<agent>/`, `.claude/agent-memory/<agent>/` and `.claude/agent-memory-local/<agent>/` (catalog kind "memory" with `meta.agent` and `meta.scope`; the Memory page tags them "Agent: <name>"); `GET /settings` now also returns `keybindings` (`~/.claude/keybindings.json` parsed into context blocks) and `themes` (`~/.claude/themes/*.json`); `GET /projects/:id` returns `worktreeInclude` (its patterns). `classify` makes `~/.claude/agent-memory/` editable. Tests in `server/test/library.test.ts` and `server/test/fs.test.ts`.
- [x] 5. Plugins page (2026-10-18): on/off through `POST /plugins/enable|disable`, Uninstall with a confirmation, "Find plugins" and "New plugin" panels (`web/src/pages/PluginPanels.tsx`, opened with `?panel=find|new`). Request checks and output parsing live in `server/src/scan/plugins.ts`, tested in `server/test/plugins.test.ts`. Plugins in `~/.claude/skills/` (`<name>@skills-dir`) now show on the page; removing one moves its folder to Archived items and drops its `enabledPlugins` entry. Tested for real with cc-test-plugin: created, turned off and on, removed; checked at 390, 768, 1024 and 1440 px in light and dark. Install and uninstall of marketplace plugins are tested only on parsed output.
- [x] 6. Projects (2026-10-18), except the cka-prep and sharepoint backlog move (waiting for John, see above): the board (`web/src/pages/ProjectBoard.tsx`, parser `server/src/parsers/board.ts` on `server/src/parsers/eol.ts`, which keeps each line's own ending), New project (`web/src/pages/NewProject.tsx`, `POST /projects-new`), Add context (`web/src/pages/ProjectContext.tsx`, `POST /projects/:id/context` and `/context/import`, CLAUDE.md lines by `server/src/parsers/imports.ts`), and the summary project page in `web/src/pages/Projects.tsx`. Server routes are in `server/src/api/projectWork.ts`; round-trip tests (CRLF, mixed endings, no final newline) in `server/test/parsers.test.ts`, endpoint tests in `server/test/api.test.ts`. Tested for real with cc-test-project: created it, added a context file (a PNG was refused), switched its CLAUDE.md line on and off (CLAUDE.md back to its exact bytes), added a card, moved it Next → In progress (drag) → Done → Next (menu), edited and deleted it; git diff showed only the card's lines changed and PROGRESS.md ended byte-identical. Checked at 390, 768, 1024 and 1440 px in light and dark: nothing off the screen; only the board scrolls sideways (768–1279 px). Test project and its backups deleted.
- [x] 7. Settings (2026-10-18): `web/src/pages/Settings.tsx` at `/settings` with Permissions, Model, Environment variables, Status line, Sandbox, Keyboard shortcuts and Themes, a picker for which file to change (`?project=<id>&file=shared|local`), the files in the order Claude Code ranks them (from `GET /map`) with "Edit as text", and per setting which file's value is in effect. Writes go through `POST /settings/change` (rules in `server/src/parsers/settingsEdit.ts`), `POST /settings/add` (adding a rule), and `POST /keybindings/set|remove`; `GET /settings/env-value` sends one variable's value on "Show value". Tests in `server/test/api.test.ts` ("Settings page writes"). `web/src/pages/Setup.tsx` is deleted; `/setup` redirects to `/settings`. Saved every section from the UI against a throwaway copy of `~/.claude`; checked at 390, 768, 1024 and 1440 px in light and dark: nothing off the screen, nothing scrolls sideways.
- [ ] 8. **Next: Home**: the intro, the "Build your setup" cards from the docs' table and the trimmed session list (see the plan).
- [ ] 9–11 as in the plan: Sessions page, redirects, notes.

Plugin facts checked against the live docs on 2026-10-18 (plugins/cli-reference, loading, create): every plugin command exits 0 or 1; with `--json`, install, uninstall, enable and disable print one object on the last line of stdout with `command`, `outcome` ("ok"/"failed") and `message`, plus `failureCode` when it applies; enabling an enabled plugin exits 1 with `failureCode: "already_in_goal_state"` (the app treats it as done); a usage error prints no JSON, only stderr; `--json --available` entries have `pluginId`, `name`, `marketplaceName`, `source`, `description`, `version`, `installCount`; `claude plugin init` takes `--with skills|agents|hooks|mcp|lsp|output-style|channel` and writes `~/.claude/skills/<name>/` with `.claude-plugin/plugin.json` and a root `SKILL.md`; a skills-dir plugin is stopped by deleting its folder or `claude plugin disable <name>@skills-dir`, and its on/off follows the manifest's `defaultEnabled` unless a settings file sets the id. Seen on this computer (v2.1.302): `init` prints an author warning before "Created plugin" when git has no user.name, and turning a skills-dir plugin back on removes its key from settings.json.

Import facts checked against code.claude.com/docs/en/memory on 2026-10-18: `@path` imports load at launch with the CLAUDE.md; relative paths resolve from the file holding the import; up to four hops of nested imports; a space in a path is written `\ ` (quoted paths aren't imported); imports inside code spans and fenced code blocks don't count; an import outside the working directory needs a one-time approval per project, while `docs/` inside the project doesn't; a CLAUDE.md over 4 MiB is skipped, and each import counts as a separate file toward the length warnings.

Facts checked against the live docs on 2026-10-18: plugin commands take `--json`; `claude plugin list --json --available` prints one pretty-printed object (about 3,800 plugins, 2.2 MB, so it's cached for 10 minutes); `claude plugin init <name>` creates `~/.claude/skills/<name>/`; MCP servers live in `~/.claude.json` (user, and local under `projects[path]`), in `.mcp.json` (project), and in a plugin's `.mcp.json` or `plugin.json`; workflows are `.js` files with `export const meta = { name, description }`; Desktop scheduled tasks keep only name, description and prompt in `~/.claude/scheduled-tasks/<name>/SKILL.md`. Before building "create a scheduled task", test whether the Desktop app picks up a folder the app makes, and ask John if it doesn't. Agent memory lives in `~/.claude/agent-memory/<agent>/` (scope `user`), `.claude/agent-memory/<agent>/` (`project`) and `.claude/agent-memory-local/<agent>/` (`local`), with `MEMORY.md` as the index; `keybindings.json` and `themes/*.json` exist only in `~/.claude`; a theme is `{ name, base, overrides }`; `.worktreeinclude` sits at the project root and uses .gitignore syntax.

Settings facts checked against the live docs on 2026-10-18 (settings-reference, settings, permissions, sandboxing, statusline, keybindings, model-config): files rank managed, then `--settings` on the command line, then `.claude/settings.local.json`, `.claude/settings.json`, `~/.claude/settings.json`; lists such as permission rules combine across files; `env` applies per variable from the highest file that sets it; rules are checked deny, then ask, then allow; a project's allow rules apply only after the workspace trust dialog; `statusLine` is `{ type: "command", command, padding?, refreshInterval? (1 or more), hideVimModeIndicator? }`; `theme` is auto, dark (default), light, dark-daltonized, light-daltonized, dark-ansi, light-ansi or `custom:<slug>`; keybindings.json is `{ $schema?, $docs?, bindings: [{ context, bindings: { keys: action | null } }] }`, and `null` unbinds a default.

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
