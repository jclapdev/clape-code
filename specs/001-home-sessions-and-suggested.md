# 001 Home: sessions that need you, and prompts worth a skill

Backlog: #84, #95, #96, #107. Date: 2026-10-25.

## Job it serves

Job 2 in BRIEF.md: see what Claude is waiting on and answer it. Job 4: create a new skill.

## What changes for the user

- Home and Sessions no longer list runs stopped by a usage limit more than a day ago under "Paused". Those runs show as ordinary sessions with their Open and Continue buttons, in date order.
- Home loses the sentence under its heading.
- Home gets a "Suggested" section under Sessions, shown only when something qualifies: a prompt he has typed 3 or more times, with the count and a "Make it a skill" button. The button opens New skill with the name and instructions filled in from the prompt. Once a skill of that name exists, the suggestion is gone.

## Out of scope

- Any other Home or Sessions change.
- Suggesting agents, commands or anything other than a skill.

## Decisions

- Prompts are counted from `~/.claude/history.jsonl`, the file Claude Code writes each typed prompt to (`server/src/scan/map.ts:44`: "Every prompt you typed, newest last"). Counting ignores capitals and trailing spaces: `jq -r .display ~/.claude/history.jsonl | sort | uniq -c` gives "read your instructions" 7 and "Read your instructions" 4, one habit typed 11 times.
- Skipped: prompts starting with `/` (already commands) and one-word prompts. Claude's own call: the same count gives "exit" 6 and "clear" 4, Claude Code commands typed without the slash.
- Threshold 3, at most 5 suggestions, most typed first. Claude's own call.
- The server sends only the prompt text and its count, never project paths or session ids. Claude's own call, following CLAUDE.md "Pick the fields a view needs instead."
- The suggested skill name is the prompt in lower case with spaces as hyphens ("read-your-instructions"); the instructions box holds the prompt as typed. A prompt is dropped once a skill with that name exists in any scope. Claude's own call.
- A usage limit resets within hours, so a run stopped by one more than a day ago needs nothing from him (`isStaleLimit`, `server/src/api/sessions.ts:149`). It stays a normal session row so Continue is still one click.
- The sentence under Home's heading goes. BRIEF.md "What it will not do": "Put a sentence under a heading to explain it. Headings name the thing (S9)."

## Acceptance checks

1. **A1.** Open Home. No row carries a "Paused" tag, and no row at the top of the list reads "Stopped by a usage limit that has since reset".
2. **A2.** Open Sessions. No row carries a "Paused" tag. A run stopped by a usage limit on 12 Oct shows as an ordinary row with Open.
3. **A3.** Open Home. There is no sentence between the "Control Center" heading and the New session button.
4. **A4.** Open Home with a `history.jsonl` where "read your instructions" was typed 11 times (any capitals). Under Sessions, a "Suggested" section shows "read your instructions", "Typed 11 times" and a "Make it a skill" button. "exit" and any "/command" are not listed.
5. **A5.** Press "Make it a skill". The New skill form opens with name "read-your-instructions" and instructions "read your instructions" filled in.
6. **A6.** Fill in the description and save. Go back to Home: "read your instructions" is no longer suggested.
7. **A7.** At 390 px wide, the Sessions heading is visible without scrolling, and nothing on Home scrolls sideways. Light and dark both readable.
