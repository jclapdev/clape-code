# Progress

Replaced after every step. History is in git.

- **Feature:** spec 003, backlog board and Feedback button (`specs/003-backlog-board-and-feedback.md`).
- **Last step done:** 003-S2, built 26 Oct, not yet checked by the verify agent. The project page's board (`web/src/pages/ProjectBoard.tsx`) shows Open, In spec and Done with a count each; a card shows its number, the idea cut to two lines with the full text as hover text, and the verdict; an in-spec card lists its features.json steps with a Passing or Failing label. No buttons or inputs on the board. An empty column says "None"; a long column scrolls up and down inside itself. The project page's "Up next" list and its editable Backlog section (tick, edit, add) are gone. Opened once on its own port with scratch projects: at 390 px dark and 1440 px light and dark the page's scroll width equals its width (375/375 at 390 px; the old Backlog section had made it 534), a project with only a PROGRESS.md `## Next` shows three empty columns and no console errors (screenshots `specs/screenshots/003-S2-*`).
- **Next step:** verify 003-S2 (A1, A2, A3, A7), then 003-S3, the Feedback button.
- **How to run it:** open Control Center from Applications. After merging into `main`, run `bun run app` in the main checkout so the installed app gets the change. `bun run desktop` opens a development copy. For a browser check on its own port: `bun run build`, then `PORT=<free port> CC_APP_DIR=<empty folder> bun server/src/index.ts` and open http://127.0.0.1:<port>.
- **How to test it:** `bun run typecheck && bun run test && bun run build`. `server/test/parsers.test.ts` has the "board" tests (every table, escaped pipes, statuses, features.json steps, Control Center's own BACKLOG.md); `server/test/api.test.ts` has the board endpoint tests and the board in "secrets never leave the server". The pages themselves have no automated test; check them in a browser.
- **Known problems:**
  - The server still has the backlog toggle, edit and add endpoints (`server/src/api/content.ts`), which no page uses since 003-S2.
  - The project page's "Build your setup" cards still have one line under each card's name saying what it is.
  - On the tablet icon strip, conversation titles that start the same way (many on John's computer start "control-center-") are cut after three short lines; the full title is in the hover text.
  - Sessions Control Center started before 002-S1 aren't recorded, so the ones with an `sdk-` entrypoint count as runs from scripts and are hidden by default, from Sessions and from the menu's lists and "Continue last conversation".
  - A terminal session that is open but idle shows "Working" (on Sessions and in the menu) unless Claude Code writes `"status": "idle"` in its `sessions/<pid>.json`; only `"busy"` has been seen on this computer.
  - A background session that asked for something days ago still shows "Waiting for you" (one from 20 Oct on John's computer), since its job state says so.
  - Sending to a conversation open in a terminal resumes a second Claude on it (BACKLOG #112).
  - An old `/live/<id>` link only redirects while the server that started that live session is still running.
  - The browser tab on `/sessions/new` and `/sessions/<id>` is titled "Sessions – Control Center", not the conversation's name.
