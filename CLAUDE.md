# Control Center

Local web app for viewing and editing Claude Code's files.

```
browser (web/, React) -> /api (server/, Hono on Bun) -> ~/.claude, ~/.claude.json, project folders
                                                   -> Agent SDK -> claude (live sessions)
```

## Keeping users' files safe

- IMPORTANT: Write user files only through `safeWrite` in `server/src/fs/safeWrite.ts`, never with `writeFile` directly. It checks the hash the browser saw, backs up, validates and renames atomically.
- Decide read/write access only with `classify` in `server/src/fs/policy.ts`. To make a new location editable, add it there and add a case to `server/test/fs.test.ts`.
- Never read secret paths (session `.key` files, `daemon/`, `shell-snapshots/`, Claude Code's `backups/`) or send account fields from `~/.claude.json` to the browser. Pick the fields a view needs instead.
- Backlog and changelog edits must leave every untouched line byte-for-byte the same; extend the round-trip tests in `server/test/parsers.test.ts` when changing those parsers.

## Format traps

- Project folder names under `~/.claude/projects` can't be decoded to paths; read `cwd` from the transcript.
- Assistant `usage` repeats on every line of one message; count once per `message.id`.
- Timestamps are ISO in transcripts and jobs, epoch milliseconds in `history.jsonl` and `sessions/*.json`.
- `updateJson` in `server/src/api/content.ts` reads the file's hash itself, so it never refuses a stale browser hash; pass the browser's hash to `safeWrite`. Dotted keys such as `permissions.allow` come from `flatten` and must be written back nested.
- A new endpoint that sends account or CLI data goes in the "secrets never leave the server" test in `server/test/api.test.ts`.
- Projects aren't moved into each other: Claude Code files sessions and memory under the folder path, and git worktrees store absolute paths.

## Cross-platform

Runs on macOS, Linux and Windows. Build paths with `node:path` and the helpers in `server/src/fs/paths.ts` instead of `/` or `~` literals. Spawn commands with an argument array and handle the command being missing (git may not be installed).

## Verification

After a change, run in this order:
1. `bun run typecheck`
2. `bun run test`
3. `bun run build`
4. For UI changes: do the task in the running app as a person would, then check light and dark themes and a 390 px wide window. Flag sideways scrolling inside panes, not only the page. If `bun run dev` gets stopped, run the server (`bun src/index.ts` in `server/`) and Vite (`bun run dev` in `web/`) as two processes.

## How work runs

Every idea or complaint goes through the `feature` skill. Status lives in five files at the repo root: `BRIEF.md` (who it's for, the jobs), `BACKLOG.md` (every idea and its verdict), `specs/`, `features.json` (every step, failing or passing) and `PROGRESS.md` (current state only, replaced each time). Read `BRIEF.md` and `PROGRESS.md` before starting.

- Finished work is merged into `main` before it counts as done: the app shows `main`.
- Add each change a user would notice to `CHANGELOG.md` under Unreleased, and update `README.md` in the same change that adds or removes a page.
