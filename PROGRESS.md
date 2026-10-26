# Progress

Replaced after every step. History is in git.

- **Feature:** backlog fixes #28, #29, #51, #52, #57, #70 and #114 (no spec; branch `worktree-backlog-sweep`).
- **Last step done:** a separate browser check of #28, #29, #51, #52, #57, #70 and #114 on 26 Oct (port 4798, scratch `CC_HOME`, `CC_CLAUDE_DIR` and `CC_APP_DIR`); all seven pass and are `done` in BACKLOG.md with their screenshots. #51: on all 20 top-level pages the heading row starts at x=288 and is 1105 px wide at 1440 px, and starts at x=16 at 390 px. #52: five Projects cards, one with a three-line name, are all 132.6 px tall; Customize cards all 46.3 px; a project with one untracked file says "1 changed file". #29: reply box, New session box, New skill, New hook and New project each came back after another page and a reload; creating the skill removed its draft. #57: six links; routines and server-managed-settings opened real docs pages, the other four return 200. #70: "Agent: reviewer" on all three agent notes, "Only you" only on the local one. #114: Files list is `.claude-plugin/plugin.json`, `README.md`, `skills/x/SKILL.md`. No sideways scroll on 19 pages at 390 and 1440 px, light and dark.
- **Next step:** merge into `main` and run `bun run app`.
- **How to run it:** open Control Center from Applications. After merging into `main`, run `bun run app` in the main checkout so the installed app gets the change. `bun run desktop` opens a development copy. For a browser check on its own port: `bun run build`, then `PORT=<free port> CC_APP_DIR=<empty folder> bun server/src/index.ts` and open http://127.0.0.1:<port>.
- **How to test it:** `bun run typecheck && bun run test && bun run build`. `server/test/parsers.test.ts` has the "backlog" count tests (table rows by status, list fallback) and the "board" tests (every table, escaped pipes, statuses, features.json steps, Control Center's own BACKLOG.md, whose In spec count now matches its `in spec N` lines instead of expecting at least one) and the "feedback" tests; `server/test/library.test.ts` has "plugin files" (no `.in_use` or `.orphaned_at`); `server/test/api.test.ts` has the board and Feedback endpoint tests. The pages themselves have no automated test; check them in a browser.
- **Known problems:**
  - README's keyboard shortcut line shows raw `<kbd>⌘S</kbd>` tags when the README is opened in a project's Docs section.
  - The project page's "Build your setup" cards still have one line under each card's name saying what it is.
  - Opened pages (a project, a conversation) start their title 16 px further right than top-level pages (BACKLOG #116).
  - On the tablet icon strip, conversation titles that start the same way (many on John's computer start "control-center-") are cut after three short lines; the full title is in the hover text.
  - Sessions Control Center started before 002-S1 aren't recorded, so the ones with an `sdk-` entrypoint count as runs from scripts and are hidden by default, from Sessions and from the menu's lists and "Continue last conversation".
  - A terminal session that is open but idle shows "Working" (on Sessions and in the menu) unless Claude Code writes `"status": "idle"` in its `sessions/<pid>.json`; only `"busy"` has been seen on this computer.
  - A background session that asked for something days ago still shows "Waiting for you" (one from 20 Oct on John's computer), since its job state says so.
  - Sending to a conversation open in a terminal resumes a second Claude on it (BACKLOG #112).
  - Pictures in Guides are blocked by the page's image policy (BACKLOG #115).
  - An old `/live/<id>` link only redirects while the server that started that live session is still running.
  - The browser tab on `/sessions/new` and `/sessions/<id>` is titled "Sessions – Control Center", not the conversation's name.
