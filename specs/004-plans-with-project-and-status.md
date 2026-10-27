# 004 Plans with their project, status and conversations

Backlog: #33, #100. Date: 2026-10-27.

## Job it serves

Job 3 in BRIEF.md: find, read and change what shapes Claude Code, including plans.
Job 1: come back to a conversation without getting lost.

## What changes for the user

The Plans page lists each plan by its title with the project it was written for
(not "All projects") and whether it was approved. The line under the title is the
date it was last changed, not the file name. Picking a project in the project filter
shows only that project's plans. A plan's page lists the conversations that worked
on it, newest first, each opening that conversation. A conversation's page shows a
link to the plan it follows.

## Out of scope

- Writing or approving a plan from Control Center (Claude Code writes plans in plan
  mode).
- Moving or renaming plan files.

## Decisions

- A plan belongs to a conversation when a transcript line in that conversation has a
  `slug` equal to the plan's file name without `.md`, or an `attachment.planFilePath`
  equal to the plan's path. On 27 Oct, 40 of the 41 files in `~/.claude/plans` matched
  a transcript `slug` (script: collect every `"slug"` in `~/.claude/projects/*/*.jsonl`,
  intersect with `ls ~/.claude/plans`); the one left over is `one-page-per-conversation`.
- A plan's project is the Control Center project whose folder holds the `cwd` of its
  conversations. Folders that only hold projects (the Project folders in Preferences,
  such as `~/projects`) and folders in no added project are ignored. When the
  conversations fall in more than one project, the project with the most of them
  wins, and on a tie the one with the newest conversation. A plan with no such
  conversation stays "All projects". On 27 Oct, 33 of the 40 matched plans ran only
  inside one project; 7 also ran in `~/projects` itself, and
  `rustling-moseying-thunder` ran in cka-prep and control-center (script over the same
  transcripts). Claude's own call.
- Status comes from the last `ExitPlanMode` result in its conversations: "Approved"
  when it starts "User has approved" (51 distinct results on 27 Oct), "Not approved"
  when it starts "The user doesn't want to proceed" (30) or is a hook error (12), and
  "Draft" when Claude never asked for approval. Counted with a script over the same
  transcripts.
- Plans in a project's own plans folder are listed too. Source: "`plansDirectory`
  ... Choose where Claude Code stores the plan files it writes in plan mode. Claude
  Code resolves the path relative to the project root. ... Default: unset, so Claude
  Code uses `~/.claude/plans`"
  (https://code.claude.com/docs/en/settings-reference.md, read 27 Oct).
- Only `~/.claude` and added project folders are read (BRIEF.md won't-do, S10).

## Acceptance checks

1. **A1.** Open Plans. Each row shows the plan's title, a project tag naming its
   project (for example "control-center" for "Control Center as a desktop app") and a
   status tag Approved, Not approved or Draft. The line under the title is a date, not
   a `.md` file name.
2. **A2.** On Plans, pick "cka-prep" in the project filter. Only plans tagged
   cka-prep are listed and the count matches.
3. **A3.** Open a plan that has conversations. A "Conversations" section lists them
   newest first with title and date; clicking one opens that conversation's page.
4. **A4.** Open a conversation that worked on a plan. Its page shows the plan's title
   as a link; clicking it opens the plan's page.
5. **A5.** At 390 px wide and in dark theme, A1 and A3 show without sideways
   scrolling.
