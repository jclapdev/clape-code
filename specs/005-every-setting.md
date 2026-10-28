# 005 Every setting on the Settings page

Backlog: #98. Date: 2026-10-27.

## Job it serves

Job 5 in BRIEF.md: understand each setting in plain words and change it in place (S2,
A4: "Explain and edit in place").

## What changes for the user

Below the existing sections (Permissions, Model, Environment variables, Status line,
Sandbox, Keyboard shortcuts, Themes), Settings has one section per topic from Claude
Code's settings reference, such as "Interface and terminal" or "Remote, desktop, and
notifications". Every documented setting is in one of them. A row shows the setting's
key, the first sentence of its description, its value now (and which file set it) or
its default, and a control to change it in the file picked in "Change settings for".
A "Find a setting" box above the sections filters rows by key or description. The
contents list beside the page lists the new topics too.

So `agentPushNotifEnabled`, `inputNeededNotifEnabled`, `preferredNotifChannel` and
`tui`, which today show only under "Edit as text", show with their value and can be
changed in place.

## Out of scope

- Settings that only an organization sets (Scope "Managed"): BRIEF.md won't-do,
  "organization-managed settings". They are not listed.
- Global config keys kept in `~/.claude.json` (Scope "Global config"): Claude Code
  "writes for itself; you don't need to edit it"
  (https://code.claude.com/docs/en/settings.md, read 27 Oct). Not listed.
- Changing the existing seven sections.

## Decisions

- The list comes from https://code.claude.com/docs/en/settings-reference.md. On 27
  Oct it had 247 `### \`key\`` entries under 17 `## ` topics (`grep -c '^### \`'`),
  246 with a `* **Type**:` and a `* **Scope**:` line. The one without them,
  `taskOutputMaxChars`, says "Removed in v2.1.277" and is not listed. The server fetches
  the page, keeps the parsed list in the app folder, and ships a parsed copy taken at
  build time for when the computer is offline. Claude's own call, so new settings show
  without a new release.
- Topics "Settings index", "Enterprise and managed settings", "Global config
  settings" and "See also" are not sections. Settings already edited by an existing
  section (for example `permissions`, `model`, `env`, `statusLine`, `sandbox`) are
  listed with a link to that section instead of a second control. Claude's own call.
- Control by type, from the `* **Type**:` line: "Boolean" is an on/off switch;
  "string, one of:" is a choice of the listed values; a number type is a number box;
  other strings are a text box; an array of strings is one value per line. Any other
  type (objects, mixed) shows its value and an "Edit as text" link to that key.
  Counted on 27 Oct: 92 Boolean, 22 "string, one of:" (`grep '^\* \*\*Type\*\*'
  | sort | uniq -c`). Claude's own call.
- A setting with Scope "User or managed" can be changed only in your settings for
  every project; with another file picked, its control is off and says so. Scope
  counts on 27 Oct included 12 plain "User or managed" and 92 plain "Any file".
- "Off" or empty in a control removes the key from the file instead of writing a
  default, so Claude Code's own default applies. Except: a switch writes `false` when
  the setting is on by default (22 settings) or another settings file turns it on,
  since removing the key would leave it on (found while building 005-S3; #124). Writes go through `safeWrite`
  (CLAUDE.md). Claude's own call.
- No sentence goes under a section heading (BRIEF.md won't-do).

## Acceptance checks

1. **A1.** Open Settings. Below Themes are topic sections, including "Interface and
   terminal" and "Remote, desktop, and notifications", and the contents list names
   them. `tui` is in "Interface and terminal" with its description, its value now
   from `~/.claude/settings.json` and a choice of "default" and "fullscreen".
2. **A2.** Type `notif` in "Find a setting". Only rows whose key or description
   contains it remain, including `agentPushNotifEnabled`, `inputNeededNotifEnabled`
   and `preferredNotifChannel`, each with its value now.
3. **A3.** With "Change settings for" on a scratch project, turn an on/off setting on,
   pick a value in a choice setting and type a number in a number setting. Each
   saves; that project's `.claude/settings.json` (`.claude/settings.local.json` when
   "Only you" is picked) has the new keys and every other line of it is unchanged. Turning the switch off again removes
   its key.
4. **A4.** Pick a scratch project in "Change settings for". A "User or managed"
   setting's control is off and says it can be set only in your settings for every
   project.
5. **A5.** A setting whose type is an object shows its value and an "Edit as text"
   link that opens the file at that key.
6. **A6.** At 390 px wide and in dark theme, the new sections show without sideways
   scrolling, in the page or inside any row.
