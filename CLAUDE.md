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

## Cross-platform

Runs on macOS, Linux and Windows. Build paths with `node:path` and the helpers in `server/src/fs/paths.ts` instead of `/` or `~` literals. Spawn commands with an argument array and handle the command being missing (git may not be installed).

## Verification

After a change, run in this order:
1. `bun run typecheck`
2. `bun run test`
3. `bun run build`
4. For UI changes: `bun run dev`, open http://localhost:5317, check light and dark themes and a 390 px wide window.
