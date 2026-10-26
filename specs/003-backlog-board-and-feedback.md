# 003 Backlog board and Feedback button

Backlog: #64, #97, #32, #103. Date: 2026-10-26.

## Job it serves

Job 7 in BRIEF.md: see each project's tasks and what changed in it, so nobody is lost
after time has passed. Job 8: drop an idea or complaint, for one project or all of them,
while Claude is working, and have it acted on.

## What changes for the user

A project's board shows its `BACKLOG.md`: one card per idea, in three columns by
status (Open, In spec, Done). A card shows the idea's number, his words and the verdict.
A card that is in a spec lists that spec's build steps from `features.json`, each marked
passing or failing. The board can't be edited by hand, because Claude changes a
backlog line's status as the work moves.

Every page has a Feedback button in the menu. It opens a box where he types a note and
picks the project it's for (the one he's looking at, or All projects). Saving adds the
note to that project's `BACKLOG.md` as a new `pending`, `open` line. Notes for All
projects go to `~/.claude/BACKLOG.md`. He sees the line's number, and the card shows on
that project's board. If he closes the box before saving, the text he typed is still
there when he opens it again.

## Out of scope

- Acting on feedback automatically: a scheduled job, or an agent watching usage (#35
  stays pending).
- Changing a backlog line's verdict or status from the app.

## Decisions

- The board reads only `BACKLOG.md`. The PROGRESS.md board (Next / In progress / Done
  columns, and adding, editing, moving and deleting cards) is removed. Running
  `grep -qiE '^## (Next|In progress|Done)'` over every `~/projects/*/PROGRESS.md` on
  26 Oct matched none, so no project uses it. Claude's own call.
- The board is read-only. The feature process sets each line's status, and ideas come
  in through Feedback. Claude's own call.
- If a project has no `BACKLOG.md`, the first note creates one from the feature
  skill's template (`~/.claude/skills/feature/assets/BACKLOG.md`). Until then the
  board shows three empty columns. Claude's own call.
- The board reads every numbered row of every table in `BACKLOG.md`; Control Center's
  own file has four tables, under the headings at lines 10, 58, 84 and 121.
- A note becomes `| <n> | <today> | "<note>" | pending | | Feedback in Control Center |
  open |`, where `<n>` is the highest number in any table plus one. It goes at the end
  of a `## Feedback` table at the end of the file, which is added if it isn't there.
  Every other line keeps its exact bytes. A `|` or line break in the note is written as
  `\|` or a space. Claude's own call.
- An idea in the card text is cut to two lines; the full text is in the hover text.
  Claude's own call.

## Acceptance checks

Each is something a person does in the running app and what they should see. The
checks use a scratch project and a scratch `~/.claude` folder, never John's own files.

1. **A1.** Open a project page whose `BACKLOG.md` has open, in-spec and done lines. The
   board has Open, In spec and Done columns. Each column's count matches the number
   of lines with that status. Each card shows its number, the idea (at most two
   lines) and the verdict.
2. **A2.** A card whose status is `in spec NNN` lists the steps in `features.json` for
   `specs/NNN-*.md`, each with its description and passing or failing.
3. **A3.** Open a project with no `BACKLOG.md` but a `PROGRESS.md` that has a `## Next`
   section. The board shows three empty columns, no cards from PROGRESS.md, and no
   error.
4. **A4.** On any page, click Feedback in the menu, type a note, keep the project
   selected and click Save. You see "Added as #<n>". The project's `BACKLOG.md` has the
   new line at the end of its Feedback table with that number, `pending` and `open`; every other
   line is unchanged. The card is in Open on that project's board.
5. **A5.** Do the same with All projects selected. The line goes to
   `~/.claude/BACKLOG.md`, which is created if it was missing.
6. **A6.** Type a note, close the Feedback box without saving, go to another page and
   open it again. The note is still there. After saving, the box is empty.
7. **A7.** At 390 px wide and at 1440 px, in light and dark: the Feedback button can be
   reached, and neither the board nor the Feedback box scrolls sideways.
