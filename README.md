# Control Center

A local web app for seeing and managing everything Claude Code keeps on your computer: projects, sessions, background jobs, skills, agents, commands, rules, hooks, plugins, memory, plans and settings. You can edit these files safely, archive or delete the ones you no longer want, and start or answer Claude sessions from the browser.

It runs on macOS, Linux and Windows. Your files stay where they are; the app reads them and writes them back.

## Start it

Open Control Center from Applications (or Spotlight). It opens in its own window; quitting it (Cmd+Q) stops it.

The first time, macOS asks whether "launcher" may open files in folders such as Documents, Desktop or iCloud Drive. Those questions come from Control Center reading projects kept there.

## After changing the code

Run this in this folder to rebuild the app and reinstall it in `~/Applications`:

```shell
bun run app
```

Quit Control Center before running it, then open it again.

## Development

```shell
bun install
bun run desktop      # builds the web app and opens a development copy of the app window
bun run dev          # server on 4317 with reload, web app on http://localhost:5317 in your browser
```

## Single file for another computer

Build one executable per platform with [Bun](https://bun.sh):

```shell
bun install
bun run compile                      # all platforms, into dist/
bun run compile darwin-arm64         # or just the ones you need
```

Then run the one for that computer:

```shell
./dist/control-center-darwin-arm64     # macOS on Apple silicon (tested)
./dist/control-center-darwin-x64       # macOS on Intel (built, not run)
./dist/control-center-linux-x64        # Linux on Intel/AMD (built, not run)
./dist/control-center-linux-arm64      # Linux on ARM (tested in a container)
dist\control-center-windows-x64.exe    # Windows (built, not run; see docs/windows-test.md)
```

The browser opens at `http://127.0.0.1:4317`. Add `--no-open` to skip that.

## Claude Code is required for live sessions

Starting and answering sessions uses the Claude Code installed on the computer, found on your PATH or in its usual install folder, with your Claude Code settings. That includes Amazon Bedrock set up with `/setup-bedrock`, which saves its settings in `~/.claude/settings.json`. Bedrock set up only with `export` lines in your shell profile applies only when the app is started from that shell.

## What's in it

| View | What it does |
|---|---|
| Home | Everything waiting for you: approvals, questions, blocked background jobs. Recent changes across projects. |
| Projects | Each project's board of its BACKLOG.md (Open, In spec, Done; read-only), changelog (add today's entry), docs, `.claude` configuration and sessions. |
| Sessions | Your conversations, one row each with its name, project and time since last activity; from a project page only that project's. `claude -p` runs and archived conversations show when you turn them on. Each opens as one page: the whole conversation with tool calls folded away, approvals and Claude's questions as cards you can answer, and a reply box at the bottom that keeps it going. Copy a resume command, archive or delete from the page's menu. |
| New session | An empty conversation page: pick the project, model and permission mode in the row under the reply box and send the first message. Every New session button opens it with the current project filled in. |
| Jobs | Background jobs and their timelines. |
| Library | Skills, agents, commands, rules, output styles, hooks, hook scripts, settings files, CLAUDE.md files, plans, memory notes and plugins, globally or per project. Edit, create, archive or delete one item or many, turn skills and plugins on or off. Skills are checked against the Agent Skills spec when saved. |
| Settings | The value Claude Code actually uses for each setting, which file it comes from, and what it overrides. |
| Map | Every file and folder Claude Code uses, what it is, and whether you can edit it. |
| Archive | Items you archived, with Restore. |

The search box at the top of the menu searches everything. Feedback in the menu adds a note to a project's BACKLOG.md, or to `~/.claude/BACKLOG.md` for all projects, as a new pending, open line. <kbd>⌘S</kbd> (<kbd>Ctrl S</kbd> on Windows and Linux) saves the open file. Preferences has the theme (match system, light, dark).

## How it keeps your files safe

- Every save shows what changed, keeps the previous version in the app's `backups` folder, and is refused if the file changed on disk after you opened it. You then see both versions and choose.
- Files that Claude Code manages, such as transcripts and `history.jsonl`, are read-only.
- Files holding tokens or account details, including `~/.claude.json`, are never read through the app or sent to the browser.
- Archive moves an item into the app's `archive` folder so Claude Code stops loading it; Restore puts it back. Delete moves it to the system trash.
- Archived sessions are only hidden from the list, so `claude --resume` still works.

App data lives in `~/.config/control-center` (macOS and Linux) or `%APPDATA%\control-center` (Windows): `config.json`, `backups/`, `archive/`, `index.sqlite` (a cache you can delete) and `metrics.json`.

## Home network mode

By default only this computer can open the app. To use it from your phone at home, open Preferences on this computer, set a password and turn on home network mode. The app restarts on HTTPS with a certificate it makes itself, so your browser warns the first time. Other devices sign in with the password; logins are rate limited.

## Checks

```shell
bun run typecheck    # server, web app and the desktop entry point
bun run test         # server tests
bun run build
```

The server is TypeScript on Bun with Hono, SQLite for the search index, and the Claude Agent SDK for live sessions. The web app is React with shadcn/ui (Radix), TanStack Router and Query, Tailwind and CodeMirror.
