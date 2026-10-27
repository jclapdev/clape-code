# Progress

Replaced after every step. History is in git.

- **Feature:** backlog #39, read only `~/.claude` and the folders inside the Project folders (BRIEF.md won't-do S10), on branch `worktree-backlog-sweep-2` after spec 004 (#33, #100).
- **Last step done:** #39 on 27 Oct. `discoverProjectDirs` returns only folders inside `projectRoots`; folders named as a conversation's `cwd` or in `~/.claude.json` `projects` are no longer stat'ed, listed, read or run git in, so the catalog, search index, map, suggested prompts, file access and watchers skip them too. The "other" project group and the Preferences sentence about finding folders automatically are gone. Continuing a conversation and restoring an MCP server still use that conversation's or server's folder. Browser check against the real ~/.claude: Projects lists 13 projects, all under ~/projects; Sessions lists 304 conversations, 29 from folders outside ~/projects, with no project; Plans lists 41.
- **Next step:** merge into `main` and `bun run app`.
- **Shipped:** not yet merged into `main`.
- **How to run it:** open Control Center from Applications. After merging into `main`, run `bun run app` in the main checkout so the installed app gets the change. `bun run desktop` opens a development copy. For a browser check on its own port: `bun run build`, then `PORT=<free port> CC_APP_DIR=<empty folder> bun server/src/index.ts` and open http://127.0.0.1:<port>. A fresh worktree needs `bun install --frozen-lockfile` first.
- **How to test it:** `bun run typecheck && bun run test && bun run build`. `server/test/plans.test.ts` has the ExitPlanMode answer tests, slug and folder recording, the plan-to-conversation links, project choice (most conversations, then newest, then most lines; folders in no project ignored) and `plansDirectory`; `server/test/api.test.ts` "folders outside the project folders are never looked at (#39)" spies on file and git calls across nine endpoints; "plans and their conversations" checks the catalog plan item and a conversation's `plan`. `server/test/parsers.test.ts` has the backlog, board and feedback tests; `server/test/library.test.ts` "plugin files"; `server/test/api.test.ts` the board, Feedback and "page security policy" tests; `server/test/newSession.test.ts` the kept-draft test; `server/test/kbd.test.ts` the `<kbd>` tests; `server/test/format.test.ts` the plan date. The pages themselves have no automated test; check them in a browser.
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
