# Progress

Replaced after every step. History is in git.

- **Feature:** specs/001-home-sessions-and-suggested.md
- **Last step done:** 001-S1 (passing, checked in the browser against the real ~/.claude), built in commit f2ec70c. Runs stopped by a usage limit more than a day ago are ordinary rows on Home and Sessions (no "Paused" tag or "has since reset" line; the 12 Oct runs show Continue and Open); Home's heading has no sentence under it.
- **Next step:** 001-S2: Suggested section on Home, from prompts typed 3 or more times in `history.jsonl`, with a "Make it a skill" button (checks A4-A7).
- **How to run it:** open Control Center from Applications, or `bun run desktop`. For a browser check on its own port: `bun run build`, then `PORT=<free port> CC_APP_DIR=<empty folder> bun server/src/index.ts` and open http://127.0.0.1:<port>.
- **How to test it:** `bun run typecheck && bun run test && bun run build`. The overview test is in `server/test/api.test.ts` ("overview").
- **Known problems:**
  - The project board still reads PROGRESS.md's old columns, so the control-center board is empty after the merge until #64 is built.
  - Sessions still has a sentence under its heading (BACKLOG #26, #104; out of this spec's scope).
