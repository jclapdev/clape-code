# Progress

Replaced after every step. History is in git.

- **Feature:** backlog fixes #115, #116, #117 and #118 (no spec; branch `worktree-backlog-sweep`).
- **Last step done:** a separate agent checked #118 in a browser on 26 Oct (port 4881, scratch `CC_HOME`, `CC_CLAUDE_DIR`, `CC_APP_DIR`) at 1440 and 390 px, light and dark: in a scratch README's Docs view, on `/guides/features` (142 paragraphs, lists and items) and in a scratch skill, no paragraph or list is monospace or bordered; only `<kbd>` (⌘S, Esc, ⌘K) is Geist Mono with a 1px border; `<script>alert(1)</script>` shows as text, no `<script>` element, alert never ran; page width equals window width. #115 to #118 are all `done` in BACKLOG.md. Screenshots: specs/screenshots/backlog-118-{docs,guides,skill}[-390]-{light,dark}.png.
- **Next step:** merge into `main` and run `bun run app`.
- **How to run it:** open Control Center from Applications. After merging into `main`, run `bun run app` in the main checkout so the installed app gets the change. `bun run desktop` opens a development copy. For a browser check on its own port: `bun run build`, then `PORT=<free port> CC_APP_DIR=<empty folder> bun server/src/index.ts` and open http://127.0.0.1:<port>.
- **How to test it:** `bun run typecheck && bun run test && bun run build`. `server/test/parsers.test.ts` has the "backlog" count tests (table rows by status, list fallback) and the "board" tests (every table, escaped pipes, statuses, features.json steps, Control Center's own BACKLOG.md, whose In spec count now matches its `in spec N` lines instead of expecting at least one) and the "feedback" tests; `server/test/library.test.ts` has "plugin files" (no `.in_use` or `.orphaned_at`); `server/test/api.test.ts` has the board and Feedback endpoint tests and "page security policy" (#115); `server/test/newSession.test.ts` has the kept-draft test (#117); `server/test/kbd.test.ts` has the `<kbd>` tests (#118). The pages themselves have no automated test; check them in a browser.
- **Known problems:**
  - The project page's "Build your setup" cards still have one line under each card's name saying what it is.
  - On the tablet icon strip, conversation titles that start the same way (many on John's computer start "control-center-") are cut after three short lines; the full title is in the hover text.
  - Sessions Control Center started before 002-S1 aren't recorded, so the ones with an `sdk-` entrypoint count as runs from scripts and are hidden by default, from Sessions and from the menu's lists and "Continue last conversation".
  - A terminal session that is open but idle shows "Working" (on Sessions and in the menu) unless Claude Code writes `"status": "idle"` in its `sessions/<pid>.json`; only `"busy"` has been seen on this computer.
  - A background session that asked for something days ago still shows "Waiting for you" (one from 20 Oct on John's computer), since its job state says so.
  - Sending to a conversation open in a terminal resumes a second Claude on it (BACKLOG #112).
  - An old `/live/<id>` link only redirects while the server that started that live session is still running.
  - The browser tab on `/sessions/new` and `/sessions/<id>` is titled "Sessions – Control Center", not the conversation's name.
