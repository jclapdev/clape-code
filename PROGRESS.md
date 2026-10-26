# Progress

Replaced after every step. History is in git.

- **Feature:** specs/001-home-sessions-and-suggested.md
- **Last step done:** 001-S2 (built), commit 299cd99. Home has a "Suggested" section under Sessions from `GET /api/suggested` (only `{prompt, count}`), counted from `~/.claude/history.jsonl`; "Make it a skill" opens `/new?kind=skill&name=…&body=…` filled in; a suggestion drops once a skill folder of that name exists in `~/.claude/skills` or any project's `.claude/skills`. Against the real ~/.claude it shows "read your instructions" (Typed 11 times) and "wrap up" (Typed 8 times); saving was checked against a fake home only.
- **Next step:** verify 001-S2 (checks A4-A7) in the browser.
- **How to run it:** open Control Center from Applications, or `bun run desktop`. For a browser check on its own port: `bun run build`, then `PORT=<free port> CC_APP_DIR=<empty folder> bun server/src/index.ts` and open http://127.0.0.1:<port>.
- **How to test it:** `bun run typecheck && bun run test && bun run build`. The overview test is in `server/test/api.test.ts` ("overview"); the Suggested counting rules are in the same file ("suggested").
- **Known problems:**
  - The project board still reads PROGRESS.md's old columns, so the control-center board is empty after the merge until #64 is built.
  - Sessions still has a sentence under its heading (BACKLOG #26, #104; out of this spec's scope).
  - A prompt with punctuation or over 64 characters gets a skill name the form rejects (BACKLOG #109).
