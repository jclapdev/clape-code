# 006 Claude Code's own slash commands from the docs

Backlog: #89, #99. Date: 2026-10-27.

## Job it serves

Job 6 in BRIEF.md: see which slash commands exist and run them (S2, S3).

## What changes for the user

Slash commands always lists Claude Code's own commands, such as `/compact` and
`/init`, each tagged "Built into Claude Code" with its purpose, even on a computer
where no session has run in Control Center yet. The sentence "Claude Code's own
commands, such as /compact, show here after a session has run once in this app."
is gone. Commands an MCP server offers are tagged with that server's name. Your own
skills and commands, and plugin ones, keep the tags they have.

## Out of scope

- Running a command from this page differently than today.
- Commands only the Desktop app or the web offer.

## Decisions

- The list comes from the "All commands" table of
  https://code.claude.com/docs/en/commands.md. On 27 Oct it had 120 rows
  (`grep -c '^| \`/'`). The server fetches the page, keeps the parsed list in the app
  folder, and ships a parsed copy taken at build time for when the computer is
  offline. Claude's own call.
- A row's purpose is the first sentence of its Purpose cell, without Markdown links.
  20 rows start "**[Skill](...)**" (`grep '^| \`/' | grep -c 'Skill\]'`); those are
  tagged "Built-in skill". Claude's own call.
- The command name is the first word in the Command cell, for example `/add-dir`
  from `/add-dir <path>`; the rest shows as the argument hint. Claude's own call.
- Commands the last session reported (today's source,
  `knownCommands()` in `server/src/live/sessions.ts`) that the docs don't list are
  still shown, so a command newer than the docs isn't lost. Names starting `__` stay
  hidden, as today.
- MCP prompts: "MCP servers can expose prompts that appear as commands"
  (https://code.claude.com/docs/en/commands.md, "MCP prompts"). "Claude Code lists
  each MCP prompt as `/servername:promptname (MCP)`. Typing
  `/mcp__servername__promptname` also runs it."
  (https://code.claude.com/docs/en/mcp.md, "Execute MCP prompts", read 27 Oct). A
  command the last session reported in either form, or whose description ends
  "(MCP)", is tagged "From MCP server <server>". Claude's own call.

## Acceptance checks

1. **A1.** With an empty app folder (no session ever run), open Customize, then Slash
   commands. `/compact`, `/init` and `/add-dir` are listed, each tagged "Built into
   Claude Code" with a one-sentence purpose. `/add-dir` shows its `<path>` hint.
2. **A2.** On the same page there is no sentence about commands showing after a
   session has run.
3. **A3.** A bundled skill from the docs, such as `/fewer-permission-prompts`, is
   tagged "Built-in skill".
4. **A4.** Search "compact" on the page: `/compact` is found. Pick a project in the
   filter: built-in commands still show.
5. **A5.** At 390 px wide and in dark theme, the list shows without sideways
   scrolling.
