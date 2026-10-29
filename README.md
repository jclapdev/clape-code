# Clape Code

An app for seeing and managing everything Claude Code keeps on your computer: projects, sessions, instructions, skills, agents, slash commands, hooks, MCP servers, plugins, plans, memory and settings. You can edit these files safely, archive the ones you no longer want, and start or answer Claude sessions in its window or a browser.

It runs on macOS, Linux and Windows. Your files stay where they are; the app reads them and writes them back.

## Start it

Open Clape Code from Applications (or Spotlight). It opens in its own window; quitting it (Cmd+Q) stops it.

The first time, macOS asks whether "launcher" may open files in folders such as Documents, Desktop or iCloud Drive. Those questions come from Clape Code reading projects kept there.

## After changing the code

Run this in this folder to rebuild the app and reinstall it in `~/Applications`:

```shell
bun run app
```

Quit Clape Code before running it, then open it again.

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
./dist/clape-code-darwin-arm64     # macOS on Apple silicon (tested)
./dist/clape-code-darwin-x64       # macOS on Intel (built, not run)
./dist/clape-code-linux-x64        # Linux on Intel/AMD (built, not run)
./dist/clape-code-linux-arm64      # Linux on ARM (tested in a container)
dist\clape-code-windows-x64.exe    # Windows (built, not run; see docs/windows-test.md)
```

The browser opens at `http://127.0.0.1:4317`. Add `--no-open` to skip that.

## Claude Code is required for live sessions

Starting and answering sessions uses the Claude Code installed on the computer, found on your PATH or in its usual install folder, with your Claude Code settings. That includes Amazon Bedrock set up with `/setup-bedrock`, which saves its settings in `~/.claude/settings.json`. Bedrock set up only with `export` lines in your shell profile applies only when the app is started from that shell.

## What's in it

The menu on the left has these pages:

- **Home**: what's waiting for you (approvals, questions), then your recent sessions and suggestions for skills.
- **Sessions**: every conversation, newest first, with its project and when it was last active. Background and `claude -p` runs are here too; turn on "Show runs from scripts" or "Show archived" to see them.
- **A conversation**: opens as one page with tool calls folded away. Approvals and Claude's questions are cards you answer in place, and the reply box at the bottom keeps it going.
- **New session**: an empty conversation. Pick the project, model and permission mode under the box and send the first message.
- **Projects**: one card per project. A project's page has its board (BACKLOG.md as Open, In spec and Done), "Build your setup", recent sessions, context files, changelog, docs and `.worktreeinclude`.
- **Customize**: one page each for instructions, skills, slash commands, agents, hooks, MCP servers, plugins, plans, scheduled tasks, output styles, memory and workflows. Each lists every item from every project and plugin. Open one to read, edit, archive or delete it; New makes one with the guide beside the form.
- **Archived items**: what you archived, with Restore. It is the last link under Customize.
- **Settings**: your Claude account, permission rules, model, environment variables, status line, sandbox, keyboard shortcuts and themes, and which file's value is in effect.
- **Guides**: Claude Code's official guides, shown in the app, and links to the features that live in the cloud or your organization's admin console.
- **App preferences**: the theme (match system, light or dark), project folders and home network mode.

The search box at the top of the menu searches everything. **Feedback** in the menu adds a note to a project's BACKLOG.md, or to `~/.claude/BACKLOG.md` for all projects. <kbd>⌘S</kbd> (<kbd>Ctrl S</kbd> on Windows and Linux) saves the open file. Text you type in a reply box, the New session box or a New form is kept if you leave the page, until you send or save it.

## How it keeps your files safe

- Every save shows what changed, keeps the previous version in the app's `backups` folder, and is refused if the file changed on disk after you opened it. You then see both versions and choose.
- Files that Claude Code manages, such as transcripts and `history.jsonl`, are read-only.
- Files holding tokens or account details, including `~/.claude.json`, are never read through the app or sent to the browser.
- Archive moves an item into the app's `archive` folder so Claude Code stops loading it; Restore puts it back. Delete moves it to the system trash.
- Archived sessions are only hidden from the list, so `claude --resume` still works.

App data lives in `~/.config/clape-code` (macOS and Linux) or `%APPDATA%\clape-code` (Windows): `config.json`, `backups/`, `archive/`, `index.sqlite` (a cache you can delete) and `metrics.json`.

## Home network mode

By default only this computer can open the app. To use it from your phone at home, open Preferences on this computer, set a password and turn on home network mode. The app restarts on HTTPS with a certificate it makes itself, so your browser warns the first time. Other devices sign in with the password; logins are rate limited.

## Checks

```shell
bun run typecheck    # server, web app and the desktop entry point
bun run test         # server tests
bun run build
```

The server is TypeScript on Bun with Hono, SQLite for the search index, and the Claude Agent SDK for live sessions. The web app is React with shadcn/ui (Radix), TanStack Router and Query, Tailwind and CodeMirror.
