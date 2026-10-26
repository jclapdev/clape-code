# Progress

Replaced after every step. History is in git.

- **Feature:** spec 003, backlog board and Feedback button (`specs/003-backlog-board-and-feedback.md`).
- **Last step done:** 003-S1, built 26 Oct, checked by the verify agent 26 Oct: A1, A2, A3 pass in a browser and on the board endpoint with scratch projects (screenshots `specs/screenshots/003-S1-*`). The board is `board` in `GET /api/projects/:id` and also `GET /api/projects/:id/board`: every numbered row of every table in the project's BACKLOG.md (escaped `\|` kept in its cell) in Open, In spec and Done by its status (`open`, `in spec NNN`, `done`; anything else is Open), each card with number, idea, verdict and status. An `in spec NNN` card lists the `features.json` steps whose spec is `specs/NNN-*.md`, each passing or failing. No BACKLOG.md gives three empty columns. Parser: `server/src/parsers/backlogBoard.ts`. The PROGRESS.md board parser and its start/add/edit/move/delete endpoints are gone; New project no longer writes a PROGRESS.md, and its starter CLAUDE.md no longer mentions one. The project page shows the columns plainly, without edit controls, until 003-S2. Opened once on its own port: control-center's board showed Open 37, In spec 0, Done 75 (the main checkout's BACKLOG.md has no in-spec lines yet), no console errors.
- **Next step:** 003-S2, the board page: counts, cards with the idea cut to two lines (full text on hover), steps on in-spec cards, at 390 and 1440 px in light and dark.
- **How to run it:** open Control Center from Applications. After merging into `main`, run `bun run app` in the main checkout so the installed app gets the change. `bun run desktop` opens a development copy. For a browser check on its own port: `bun run build`, then `PORT=<free port> CC_APP_DIR=<empty folder> bun server/src/index.ts` and open http://127.0.0.1:<port>.
- **How to test it:** `bun run typecheck && bun run test && bun run build`. `server/test/parsers.test.ts` has the "board" tests (every table, escaped pipes, statuses, features.json steps, Control Center's own BACKLOG.md); `server/test/api.test.ts` has the board endpoint tests and the board in "secrets never leave the server". The pages themselves have no automated test; check them in a browser.
- **Known problems:**
  - The project page's "Build your setup" cards still have one line under each card's name saying what it is.
  - On the tablet icon strip, conversation titles that start the same way (many on John's computer start "control-center-") are cut after three short lines; the full title is in the hover text.
  - Sessions Control Center started before 002-S1 aren't recorded, so the ones with an `sdk-` entrypoint count as runs from scripts and are hidden by default, from Sessions and from the menu's lists and "Continue last conversation".
  - A terminal session that is open but idle shows "Working" (on Sessions and in the menu) unless Claude Code writes `"status": "idle"` in its `sessions/<pid>.json`; only `"busy"` has been seen on this computer.
  - A background session that asked for something days ago still shows "Waiting for you" (one from 20 Oct on John's computer), since its job state says so.
  - Sending to a conversation open in a terminal resumes a second Claude on it (BACKLOG #112).
  - An old `/live/<id>` link only redirects while the server that started that live session is still running.
  - The browser tab on `/sessions/new` and `/sessions/<id>` is titled "Sessions – Control Center", not the conversation's name.
