# Progress

Replaced after every step. History is in git.

- **Feature:** none yet. The feature process was set up on branch `feature-process`: BRIEF.md, BACKLOG.md (106 items), a page check with screenshots in `specs/screenshots/check-*.png`, and this file.
- **Last step done:** feature-process setup (built), see `git log feature-process`.
- **Next step:** get John's answers to the four questions below, adjust BRIEF.md and the pending backlog items they decide, then judge and spec the first open item. Proposed first: #38, one page per conversation (job 1; it also closes #93 and #105).
- **How to run it:** open Control Center from Applications, or `bun run desktop`. For a browser check on its own port: `bun run build`, then `PORT=<free port> CC_APP_DIR=<empty folder> bun server/src/index.ts` and open http://127.0.0.1:<port>.
- **How to test it:** `bun run typecheck && bun run test && bun run build`.
- **Known problems:**
  - Branch `feature-process` is not merged into `main`, and the app shows `main`.
  - The main checkout still holds the retired, untracked `.claude/work/`, `.claude/lessons.md`, `.claude/skills/breakdown/` and `.claude/agents/` (plan-reviewer, verifier). Their still-true content is in BACKLOG.md and CLAUDE.md; deleting them needs John's yes.
  - The project board reads `## Next`, `## In progress` and `## Done` from PROGRESS.md, which no longer has them, so the control-center board will be empty after the merge (BACKLOG #64).
  - Questions for John about what he wants, from contradictions in his history:
    1. Who will use Control Center? (a) only you, on your computers and phone; (b) you, and other Claude Code users who install it. Recommended: (b), since you said "A user should log in with their Claude account or AWS Bedrock account" and "It should run on any machine", while the 2026-10-17 plan said "a single power user". Decides BACKLOG #36.
    2. What do you open it for most? (a) talking to Claude in a project, like the terminal with buttons; (b) seeing and changing your setup (skills, agents, settings); (c) following each project's tasks. Recommended: (a), your 2026-10-20 description. Decides what Home leads with.
    3. Where do you look for the conversation you were just in? (a) inside its project; (b) a short list of recent and running sessions in the menu on every page; (c) one Sessions page for all projects. Recommended: (b). You said sessions belong in projects (2026-10-18) and also that you get lost between conversations (2026-10-20). Decides BACKLOG #9 and #105.
    4. What should a project's board show? (a) your ideas and their verdicts from BACKLOG.md; (b) the build steps, failing or passing, from features.json; (c) both. Recommended: (a). Decides BACKLOG #64.
