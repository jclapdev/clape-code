# 002 One page per conversation

Backlog: #108, #38, #93, #34, #9, #94, #50, #86, #105. Date: 2026-10-25.

## Job it serves

Job 1 in BRIEF.md: start a conversation with Claude in a project, reply to it, and come
back to it later without getting lost.

## What changes for the user

Every conversation has one page, at `/sessions/<session id>`, from its first message to
its last. The reply box sits at the bottom of that page. Typing there and pressing Enter
keeps the conversation going, whether Claude is working, finished, or the session was
started in the terminal. Approvals and questions appear inside the conversation where
Claude stopped, and are answered there. Tool calls are folded into one line each, so
Claude's replies stay in front. The header says what the conversation is, which project
it's in, and whether Claude is working, waiting for you, or done.

A new conversation is the same page with nothing in it yet. The project, model and
permission mode sit in a row under the reply box.

The Sessions list shows conversations the way Claude Code's session picker does: one
row style, named by the session's title, with the project and the time since last
activity. Runs started by scripts (`claude -p`) are hidden unless he asks for them.
Archived conversations can be shown. From a project page, the list starts filtered to
that project, with one switch to show every project.

From any page, the main menu has "Continue last conversation", plus the conversations
that need him and the ones running.

## Out of scope

- Forking or branching a conversation.
- Editing or deleting single messages (the brief rules out editing transcripts).
- Renaming sessions.

## Decisions

- One address per session ID. The Agent SDK docs: "**Continue** and **resume** both
  pick up an existing session and add to it", and only fork "creates a new session".
  https://code.claude.com/docs/en/agent-sdk/sessions.md
- Reply box at the bottom, sending while Claude works, model and permission mode in the
  row under the box. The desktop app docs: "type a correction and press **Enter** to
  send it without stopping the running action", and "choose the environment, project
  folder, permission mode, and model in the row under the prompt box".
  https://code.claude.com/docs/en/desktop.md
- Tool calls folded by default. The desktop app docs, Normal view: "Tool calls
  collapsed into summaries, with full text responses".
  https://code.claude.com/docs/en/desktop.md
- Hide `claude -p` runs by default. The sessions docs: "Claude Code leaves sessions
  created with `claude -p` or the Agent SDK out of the session picker and out of
  `claude --continue`." Control Center starts its own sessions through the Agent SDK,
  so those stay shown. A session is hidden when its transcript's `entrypoint` starts
  with `sdk-` and Control Center did not start it; Control Center keeps the session ID
  of every session it starts. The `entrypoint` value alone can't tell the two apart:
  the SDK sets `"sdk-ts"` only when `CLAUDE_CODE_ENTRYPOINT` is unset
  (`if(!Ct.CLAUDE_CODE_ENTRYPOINT)Ct.CLAUDE_CODE_ENTRYPOINT="sdk-ts"` in
  `node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs`), and the app's own test
  session records `"entrypoint": "sdk-cli"` (`server/test/fixtures/transcript.jsonl`
  line 3). Of the transcripts changed in the last 14 days, 70 have
  `"entrypoint":"sdk-cli"`, 27 `"cli"`, 3 `"sdk-ts"` and 7 none (a Python count over
  `~/.claude/projects/*/*.jsonl` modified in the last 14 days, 2026-10-25).
- Row title: "the session name if you set one, otherwise the AI-generated session
  title, conversation summary, or first prompt, along with time since last activity".
  https://code.claude.com/docs/en/sessions.md ("Use the session picker"). Never a
  `user:` prefix.
- Filtered to the current project, one switch for every project. The sessions docs:
  the picker shows "Sessions from the current worktree" and `Ctrl+A` widens "to every
  project on this machine". https://code.claude.com/docs/en/sessions.md
- "Continue last conversation" opens the most recent conversation. The sessions docs:
  "`claude --continue` | Reopens the most recent session in the current directory".
  https://code.claude.com/docs/en/sessions.md
- Tool calls are already folded on the transcript page (`web/src/components/Transcript.tsx`
  line 10, "consecutive tool calls folded into one collapsed row"); the new page keeps
  that, including while Claude is working (#34).
- "Copy command for the terminal" (the only button while a session runs; a finished
  session shows "Continue this session", which opens a separate form) moves to a menu
  on the page,
  and the filter row ("Only my messages", "Show Claude's thinking", "Subagent runs",
  "7 prompts ↑↓") is reduced to one "Show details" switch that unfolds tool calls and
  thinking, like the desktop app's Verbose view. Source for #108:
  `specs/screenshots/check-session-1440.png`. Claude's own call on the exact controls.
- Old addresses keep working: `/live/<id>`, `/jobs/<id>` and `/live?resume=<id>`
  redirect to the conversation page; `/live` redirects to `/sessions/new`. Claude's own
  call, so no saved link breaks.

## Acceptance checks

Each is something a person does in the running app and what they should see.

1. **A1.** Open a finished conversation from Sessions. You see the whole conversation
   from the first message, each tool call as one folded line, and a reply box at the
   bottom. There is no "Continue" button and no separate form.
2. **A2.** Type a message in that reply box and press Enter. Claude's reply appears on
   the same page, below the earlier messages, and the address stays the same.
3. **A3.** While Claude is working, type another message and press Enter. It is sent
   without stopping Claude, and Claude answers it. A Stop button next to the box stops
   Claude.
4. **A4.** In Manual permission mode, ask Claude to create a file. An approval card
   appears in the conversation; Allow lets Claude create it. Ask Claude a question that
   makes it use AskUserQuestion; the question card appears in the conversation and
   answering it continues the turn.
5. **A5.** Open `/live/<old id>`, `/jobs/<id>` and `/live?resume=<id>`. Each lands on
   the conversation page for that session.
6. **A6.** Click New session from a project page. You get an empty conversation page
   with that project, the model and the permission mode in the row under the box.
   After the first message the address becomes `/sessions/<session id>` without
   leaving the page.
7. **A7.** Open Sessions. Every row looks the same: title, project, time since last
   activity, and a state label only when Claude is working or waiting for you. No row
   title starts with `user:`. No `claude -p` run is listed until you turn on "Show
   runs from scripts".
8. **A8.** Open Sessions from a project page. Only that project's conversations are
   listed; one switch shows every project. Turn on "Show archived"; archived
   conversations appear, marked as archived.
9. **A9.** From Home, Settings and a Customize page, click "Continue last conversation"
   in the main menu. It opens the conversation you last sent a message in. The menu
   also lists any conversation that needs you and any that is running.
10. **A10.** Do A1-A9's flow at 390, 768, 1024 and 1440 px wide, in light and dark.
    Nothing overlaps, the reply box stays visible at the bottom, and no page scrolls
    sideways.
