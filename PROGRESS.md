# Progress

Replaced after every step. History is in git.

- **Feature:** spec 004, plans with their project, status and conversations (specs/004-plans-with-project-and-status.md; backlog #33, #100; branch `worktree-backlog-sweep-2`).
- **Last step done:** 004-S2, the pages, browser check passed on 27 Oct (A1, A3, A4, A5) against the real ~/.claude. Plans lists 41 rows, each with title, project tag and status tag and "Changed <day>" under the title; "Control Center as a desktop app" is tagged control-center, Approved. "Explain every term at first use…" lists two conversations newest first (12:53 then 12:25 on 5 Oct); the first opens `/sessions/55fd44d2…`, whose header links the plan, which opens the plan page again. At 390 px in light and dark, the Plans list and the plan page have page width 390 and no element with scrollWidth > clientWidth. Screenshots: specs/screenshots/004-S2-*.png.
- **Next step:** merge into `main` and `bun run app`.
- **Shipped:** not yet merged into `main`.
- **How to run it:** open Control Center from Applications. After merging into `main`, run `bun run app` in the main checkout so the installed app gets the change. `bun run desktop` opens a development copy. For a browser check on its own port: `bun run build`, then `PORT=<free port> CC_APP_DIR=<empty folder> bun server/src/index.ts` and open http://127.0.0.1:<port>. A fresh worktree needs `bun install --frozen-lockfile` first.
- **How to test it:** `bun run typecheck && bun run test && bun run build`. `server/test/plans.test.ts` has the ExitPlanMode answer tests, slug and folder recording, the plan-to-conversation links, project choice (most conversations, then newest, then most lines; folders in no project ignored) and `plansDirectory`; `server/test/api.test.ts` "plans and their conversations" checks the catalog plan item and a conversation's `plan`. `server/test/parsers.test.ts` has the backlog, board and feedback tests; `server/test/library.test.ts` "plugin files"; `server/test/api.test.ts` the board, Feedback and "page security policy" tests; `server/test/newSession.test.ts` the kept-draft test; `server/test/kbd.test.ts` the `<kbd>` tests; `server/test/format.test.ts` the plan date. The pages themselves have no automated test; check them in a browser.
- **Known problems:**
  - A plan's project counts each conversation once for every project it ran in, then breaks a tie by the newest conversation and then by where more of its transcript lines ran; the spec names only the first two.
  - A plan's conversations show only the day, so two from the same day with the same title (as on "Explain every term at first use…") look alike.
  - The project page's "Build your setup" cards still have one line under each card's name saying what it is.
  - On the tablet icon strip, conversation titles that start the same way (many on John's computer start "control-center-") are cut after three short lines; the full title is in the hover text.
  - Sessions Control Center started before 002-S1 aren't recorded, so the ones with an `sdk-` entrypoint count as runs from scripts and are hidden by default, from Sessions and from the menu's lists and "Continue last conversation".
  - A terminal session that is open but idle shows "Working" (on Sessions and in the menu) unless Claude Code writes `"status": "idle"` in its `sessions/<pid>.json`; only `"busy"` has been seen on this computer.
  - A background session that asked for something days ago still shows "Waiting for you" (one from 20 Oct on John's computer), since its job state says so.
  - An old `/live/<id>` link only redirects while the server that started that live session is still running.
  - The browser tab on `/sessions/new` and `/sessions/<id>` is titled "Sessions – Control Center", not the conversation's name.
