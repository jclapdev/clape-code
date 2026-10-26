# Progress

Replaced after every step. History is in git.

- **Feature:** backlog fixes #53, #54, #55, #60 and #113 (no spec; branch `worktree-backlog-sweep`).
- **Last step done:** checked #53, #54, #55, #60, #106 and #113 in a browser on 26 Oct, all pass, screenshots `specs/screenshots/backlog-<n>*.png`. Scratch folders, port 4797: Projects list "4 open in the backlog" for a table BACKLOG.md with 4 open, 1 in spec, 1 done; board cards #7, #42, #113 to #116 one line high and whole at 1440 and 390 px, no "Up next"; "What you can customize" and the guide under New agent at 390 px with no word broken except at a hyphen, tables scrolling inside themselves, page 390 px wide; plugin Files without `.in_use`, Manifest "Name" once and "Author: Jane Doe · jane@example.com"; "Archived items" in the menu and on Customize, deleting a scratch skill shows "Open Archived items", which opens `/archive` listing it. John's real `~/.claude` and `~/projects`, read only, port 4810: Skills and Slash commands, every project, 0 of 43 items match "breakdown" (6 match "feature"). Projects list, project page, guide, New agent, plugin, Archived items and Customize pages: no sideways scroll at 1440 and 390 px in light and dark.
- **Next step:** merge into `main` and run `bun run app`.
- **How to run it:** open Control Center from Applications. After merging into `main`, run `bun run app` in the main checkout so the installed app gets the change. `bun run desktop` opens a development copy. For a browser check on its own port: `bun run build`, then `PORT=<free port> CC_APP_DIR=<empty folder> bun server/src/index.ts` and open http://127.0.0.1:<port>.
- **How to test it:** `bun run typecheck && bun run test && bun run build`. `server/test/parsers.test.ts` has the "backlog" count tests (table rows by status, list fallback) and the "board" tests (every table, escaped pipes, statuses, features.json steps, Control Center's own BACKLOG.md, whose In spec count now matches its `in spec N` lines instead of expecting at least one) and the "feedback" tests; `server/test/library.test.ts` has "plugin files" (no `.in_use`); `server/test/api.test.ts` has the board and Feedback endpoint tests. The pages themselves have no automated test; check them in a browser.
- **Known problems:**
  - The project page's "Build your setup" cards still have one line under each card's name saying what it is.
  - On the tablet icon strip, conversation titles that start the same way (many on John's computer start "control-center-") are cut after three short lines; the full title is in the hover text.
  - Sessions Control Center started before 002-S1 aren't recorded, so the ones with an `sdk-` entrypoint count as runs from scripts and are hidden by default, from Sessions and from the menu's lists and "Continue last conversation".
  - A terminal session that is open but idle shows "Working" (on Sessions and in the menu) unless Claude Code writes `"status": "idle"` in its `sessions/<pid>.json`; only `"busy"` has been seen on this computer.
  - A background session that asked for something days ago still shows "Waiting for you" (one from 20 Oct on John's computer), since its job state says so.
  - Sending to a conversation open in a terminal resumes a second Claude on it (BACKLOG #112).
  - A plugin's Files list still shows `.orphaned_at` (BACKLOG #114); pictures in Guides are blocked by the page's image policy (BACKLOG #115).
  - An old `/live/<id>` link only redirects while the server that started that live session is still running.
  - The browser tab on `/sessions/new` and `/sessions/<id>` is titled "Sessions – Control Center", not the conversation's name.
