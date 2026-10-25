# Progress

Replaced after every step. History is in git.

- **Feature:** none yet. The feature process is set up on branch `feature-process`: BRIEF.md, BACKLOG.md, a page check with screenshots in `specs/screenshots/check-*.png`, and this file.
- **Last step done:** John's 2026-10-25 answers went into BRIEF.md (A11, A12); BACKLOG #9, #36, #64 and #105 are decided.
- **Next step:** judge and spec the first open item, #38: one page per conversation (job 1; it also closes #93 and #105).
- **How to run it:** open Control Center from Applications, or `bun run desktop`. For a browser check on its own port: `bun run build`, then `PORT=<free port> CC_APP_DIR=<empty folder> bun server/src/index.ts` and open http://127.0.0.1:<port>.
- **How to test it:** `bun run typecheck && bun run test && bun run build`.
- **Known problems:**
  - Branch `feature-process` is not merged into `main`, and the app shows `main`.
  - The main checkout still holds the retired, untracked `.claude/work/`, `.claude/lessons.md`, `.claude/skills/breakdown/` and `.claude/agents/`. Their still-true content is in BACKLOG.md and CLAUDE.md; deleting them needs John's yes.
  - The project board still reads PROGRESS.md's old columns, so the control-center board is empty after the merge until #64 is built.
