# Clape Code brief

## Who it's for

John and other Claude Code users, each running it on their own computer (A11). It is a
GUI with the same functionality as Claude Code: everything you can see or change in
Claude Code, such as settings, skills, agents, hooks and slash commands, you can see
and change here (A12, S5). Opened from the Applications folder, sometimes from a phone
on the home network (P1, A3), and it runs on Mac, Linux and Windows (A2).

## Jobs it must do

1. Start a conversation with Claude in a project, reply to it, and come back to it
   later without getting lost (S5, A1).
2. See what Claude is waiting on and answer it: approve a command or answer a
   question, on the computer or the phone (P1).
3. Find, read and change what shapes Claude Code: instructions (CLAUDE.md and
   rules), skills, agents, hooks, slash commands, plugins, plans and memory (S1, S4).
4. Create a new skill, agent or other item, with a guide to writing a good one
   beside the form (S3, A5).
5. Understand each setting in plain words and change it in place (S2, A4).
6. See which slash commands exist and run them (S2, S3).
7. See each project's tasks and what changed in it, so nobody is lost after time
   has passed (S1, A6).
8. Drop an idea or complaint, for one project or all of them, while Claude is
   working, and have it acted on (S6, A7).
9. Open the app without a terminal (S7, A8).
10. See which account Claude Code uses, and sign in with a Claude account or an
    Amazon Bedrock account (A9).

## What it will not do

- Sync between machines, serve several people from one install, or edit
  transcripts (P1).
- Show or change what lives in the cloud or an organization's admin console:
  cloud routines, Code Review on GitHub, Slack, gateways, organization-managed
  settings, the Agent SDK. Guides links to them instead (P2).
- Put a list column beside the main menu. A list takes the full width and an item
  opens as its own page (S8).
- Put a sentence under a heading to explain it. Headings name the thing (S9).
- Read folders on the computer other than `~/.claude` and the project folders (S10).
- Have a command palette. Search is a visible box in the menu (S3, A10).

## Sources

John's own words, from session transcripts in `~/.claude/projects/`:

- **S1** 2026-10-17: "It would be nice to have a UI where I could monitor and manage
  projects, the agents that exist, the backlogs, changelogs (all the logs), plans,
  skills, rules, memory, etc... It would be even better if I could edit the
  skills/rules/agents/config/plugins/plans/etc...."
- **S2** 2026-10-18: "Its not clear how to use slash commands. The settings page is
  really weird. ... It would be cool to see a list of skills, agents, explanations of
  the settings instead of just weird stuff that only claude understands."
- **S3** 2026-10-18: "I never said anything about the command pallete. I never asked
  for one either. There are no slash commands that I can execute ... There is no way
  to create a skill or agent or best practice guides anywhere."
- **S4** 2026-10-18: "This should be a simple way to view and create skills, agents,
  hooks, instructions coupled with claude code."
- **S5** 2026-10-20: "It's supposed to be basically the same thing as what we do here
  in the terminal but with GUI components. ... I have to flip to different screens to
  reply to a "session"? ... I keep getting lost in conversations and have absolutely
  no way to start or continue them easily again."
- **S6** 2026-10-20: "There should be a section for Control Center feedback. I see
  stuff I want to be different, and then have nowhere to add the feedback while you
  work through your tasks. Feedback can apply at a global or project level"
- **S7** 2026-10-19: "How do I start the damn app and why does it have to be so
  crytic?"
- **S8** 2026-10-19: "The sidebar next to the sidebar sucks so much. ... how many
  websites do this? 0?"
- **S9** 2026-10-20: "There are tons of cases where instead of having a heading title
  you are explaining what the title is for." (also 2026-10-18: "'What changed' is not
  the title of a section in a web application.")
- **S10** 2026-10-20: "Why is control center trying to access every single folder on
  my computer?"

His answers to multiple-choice questions:

- **A1** 2026-10-17, "Should the app only manage files, or also start and control
  Claude sessions?": "Also launch sessions".
- **A2** 2026-10-17: "This application should not be Mac Specific. It should run on
  any machine no matter what".
- **A3** 2026-10-17, "Who should be able to reach the app?": "Also my local network,
  with a password".
- **A4** 2026-10-18, Settings redo: "Explain and edit in place (Recommended)".
- **A5** 2026-10-18, "How should creating a skill or agent work?": "Guided form +
  guide (Recommended)".
- **A6** 2026-10-18: "The changelog and backlog are meant to be quick guides for users
  and developers so that they dont get lost after time has passed."
- **A7** 2026-10-20: "Feedback should automatically be applied. There should probably
  be a scheduled job that runs at a frequent interval to check for new feedback."
- **A8** 2026-10-20: "Electrobun app (Recommended)" (double-click icon, own window).
- **A9** 2026-10-20: "This should be using my paid subscription. ... A user should
  log in with their Claude account or AWS Bedrock account."
- **A10** 2026-10-18, "Should there be a search box?": "Visible search in the menu
  (Recommended)".
- **A11** 2026-10-25, "Who is Control Center for?": "Me and other Claude Code users".
- **A12** 2026-10-25, "What do you open Control Center for most?": "This is meant to
  be a GUI view that is identical in functionality to Claude Code. I should be able to
  see and change all claudes settings/skills/agents/anything hooks ... see slash
  commands literally everything".

Approved plans in `~/.claude/plans/`:

- **P1** The MVP plan approved 2026-10-17 (its text survives in the session
  transcript; the file `rustling-moseying-thunder.md` was overwritten the same day):
  "User: John, a single power user, working on several machines and sometimes from
  his phone at home."; "Home: what needs you now"; "John can answer a waiting
  session from the browser, on the laptop and on the phone."; "Won't do: syncing
  between machines, multiple users, editing transcripts."
- **P2** `encapsulated-mixing-clarke.md`, approved 2026-10-18: "In scope: everything
  Claude Code keeps on this computer." "Out of scope, linked from Guides instead:
  ... cloud routines, Code Review on GitHub, Slack, gateways, organisation-managed
  settings and the Agent SDK."
