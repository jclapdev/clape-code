# Progress

Replaced after every step. History is in git.

- **Feature:** specs/001-home-sessions-and-suggested.md, finished: both steps pass.
- **Last step done:** 001-S2 (verified in the browser: A4-A7 pass against a fake home), then #109 fixed in commit 5b47e14. Home has a "Suggested" section under Sessions from `GET /api/suggested` (`{prompt, name, count}` only), counted from `~/.claude/history.jsonl`; "Make it a skill" opens `/new?kind=skill&name=…&body=…` filled in; a suggestion drops once a skill folder of that name exists in `~/.claude/skills` or any project's `.claude/skills`.
- **Next step:** judge #108, John's complaint about the Sessions view, together with #38 (one page per conversation) and #93.
- **How to run it:** open Control Center from Applications. After merging into `main`, run `bun run app` in the main checkout so the installed app gets the change. `bun run desktop` opens a development copy. For a browser check on its own port: `bun run build`, then `PORT=<free port> CC_APP_DIR=<empty folder> bun server/src/index.ts` and open http://127.0.0.1:<port>.
- **How to test it:** `bun run typecheck && bun run test && bun run build`. The overview test is in `server/test/api.test.ts` ("overview"); the Suggested rules are in the same file ("suggested").
- **Known problems:**
  - The project board still reads PROGRESS.md's old columns, so the control-center board is empty until #64 is built.
  - Sessions still has a sentence under its heading (BACKLOG #26, #104).
