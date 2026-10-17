# Control Center

A local web app for seeing and managing everything Claude Code keeps on your computer: projects, sessions, background jobs, skills, agents, commands, rules, hooks, plugins, memory, plans and settings. You can edit these files safely, archive or delete the ones you no longer want, and start or answer Claude sessions from the browser.

It runs on macOS, Linux and Windows. Your files stay where they are; the app reads them and writes them back.

## Install

Download the executable for your computer from the releases, or build it yourself (see below), then run it:

```shell
./control-center-darwin-arm64        # macOS on Apple silicon
./control-center-darwin-x64          # macOS on Intel
./control-center-linux-x64           # Linux
control-center-windows-x64.exe       # Windows
```

The browser opens at `http://127.0.0.1:4317`. Add `--no-open` to skip that. Starting and answering sessions needs Claude Code installed and signed in (`claude` on your PATH).

To run from source instead, install [Bun](https://bun.sh) and:

```shell
bun install
bun run start        # builds the web app and serves it on port 4317
```

## What's in it

| View | What it does |
|---|---|
| Home | Everything waiting for you: approvals, questions, blocked background jobs. Recent changes across projects. |
| Projects | Each project's backlog (tick, edit, add items), changelog (add today's entry), docs, `.claude` configuration and sessions. |
| Sessions | Every transcript, with tool calls folded away, a "my prompts only" filter and subagent runs. Copy a resume command, resume in the browser, archive or delete, one at a time or in bulk. |
| Live | Start or resume a session in any project. Approvals and Claude's questions appear as cards you can answer. |
| Jobs | Background jobs and their timelines. |
| Library | Skills, agents, commands, rules, output styles, hook scripts, CLAUDE.md files, plans, memory notes and plugins, globally or per project. Edit, create, archive, delete, turn skills and plugins on or off, validate skills. |
| Settings | The value Claude Code actually uses for each setting, which file it comes from, and what it overrides. |
| Map | Every file and folder Claude Code uses, what it is, and whether you can edit it. |
| Archive | Items you archived, with Restore. |

Press <kbd>⌘K</kbd> (<kbd>Ctrl K</kbd> on Windows and Linux) to search everything. <kbd>[</kbd> and <kbd>]</kbd> hide the menu and the list pane; drag the dividers to resize. Preferences has the theme (match system, light, dark) and the full shortcut list.

## How it keeps your files safe

- Every save shows what changed, keeps the previous version in the app's `backups` folder, and is refused if the file changed on disk after you opened it. You then see both versions and choose.
- Files that Claude Code manages, such as transcripts, `history.jsonl` and `~/.claude.json`, are read-only.
- Files holding tokens or account details are never read or sent to the browser.
- Archive moves an item into the app's `archive` folder so Claude Code stops loading it; Restore puts it back. Delete moves it to the system trash.
- Archived sessions are only hidden from the list, so `claude --resume` still works.

App data lives in `~/.config/control-center` (macOS and Linux) or `%APPDATA%\control-center` (Windows): `config.json`, `backups/`, `archive/`, `index.sqlite` (a cache you can delete), `metrics.json` and `feedback.md`.

## Home network mode

By default only this computer can open the app. To use it from your phone at home, open Preferences on this computer, set a password and turn on home network mode. The app restarts on HTTPS with a certificate it makes itself, so your browser warns the first time. Other devices sign in with the password; logins are rate limited.

## Develop

```shell
bun install
bun run dev          # server on 4317 with reload, web app on http://localhost:5317
bun run test         # server tests
bun run typecheck
bun run compile      # executables for every platform in dist/
```

The server is TypeScript on Bun with Hono, SQLite for the search index, and the Claude Agent SDK for live sessions. The web app is React with TanStack Router and Query, Tailwind and CodeMirror.
