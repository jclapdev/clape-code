// Keyboard shortcut contexts and actions as listed on https://code.claude.com/docs/en/keybindings (read 2026-10-18).
// Copied from the Contexts table and the action tables on that page; update it from the page when Claude Code adds actions.

export const KEY_CONTEXTS: { name: string; description: string }[] = [
  {
    "name": "Global",
    "description": "Applies everywhere in the app"
  },
  {
    "name": "Chat",
    "description": "Main chat input area"
  },
  {
    "name": "Autocomplete",
    "description": "Autocomplete menu is open"
  },
  {
    "name": "Settings",
    "description": "Settings menu"
  },
  {
    "name": "Confirmation",
    "description": "Permission and confirmation dialogs"
  },
  {
    "name": "Tabs",
    "description": "Tab navigation components"
  },
  {
    "name": "Help",
    "description": "Help menu is visible"
  },
  {
    "name": "Transcript",
    "description": "Transcript viewer"
  },
  {
    "name": "HistorySearch",
    "description": "History search mode (Ctrl+R)"
  },
  {
    "name": "Task",
    "description": "A task is running in the foreground"
  },
  {
    "name": "ThemePicker",
    "description": "Theme picker dialog"
  },
  {
    "name": "Attachments",
    "description": "Image attachment navigation in select dialogs"
  },
  {
    "name": "Footer",
    "description": "Footer indicator navigation (tasks, teams, diff, artifacts)"
  },
  {
    "name": "MessageSelector",
    "description": "Rewind and summarize dialog message selection"
  },
  {
    "name": "DiffDialog",
    "description": "Diff viewer navigation"
  },
  {
    "name": "DiffPanel",
    "description": "The diff panel is open"
  },
  {
    "name": "ModelPicker",
    "description": "Model picker effort level"
  },
  {
    "name": "EffortSlider",
    "description": "Effort slider opened by /effort"
  },
  {
    "name": "Select",
    "description": "Generic select/list components"
  },
  {
    "name": "Plugin",
    "description": "Plugin dialog (browse, discover, manage)"
  },
  {
    "name": "AbovePrompt",
    "description": "The band above the prompt, or a button in it, has keyboard focus"
  },
  {
    "name": "AbovePromptInput",
    "description": "An input field in the band above the prompt or in a mod's pane has keyboard focus"
  },
  {
    "name": "AbovePromptSelect",
    "description": "A select in the band above the prompt or in a mod's pane has keyboard focus"
  },
  {
    "name": "Pane",
    "description": "A pane drawn by a mod has keyboard focus"
  },
  {
    "name": "PaneField",
    "description": "An input field or select in a mod's pane has keyboard focus"
  },
  {
    "name": "Agents",
    "description": "Agent view (claude agents)"
  },
  {
    "name": "Scroll",
    "description": "Conversation scrolling and text selection in fullscreen mode"
  }
];

export const KEY_ACTIONS: { action: string; defaultKeys: string; description: string; group: string }[] = [
  {
    "action": "app:interrupt",
    "defaultKeys": "Ctrl+C",
    "description": "Cancel current operation",
    "group": "App"
  },
  {
    "action": "app:exit",
    "defaultKeys": "Ctrl+D",
    "description": "Exit Claude Code. Press twice within 800ms to confirm",
    "group": "App"
  },
  {
    "action": "app:redraw",
    "defaultKeys": "(unbound)",
    "description": "Force terminal redraw",
    "group": "App"
  },
  {
    "action": "app:toggleTodos",
    "defaultKeys": "Ctrl+T",
    "description": "Toggle visibility of Claude's to-do checklist. This is not the /tasks background-task view",
    "group": "App"
  },
  {
    "action": "app:toggleTranscript",
    "defaultKeys": "Ctrl+O",
    "description": "Toggle verbose transcript",
    "group": "App"
  },
  {
    "action": "history:search",
    "defaultKeys": "Ctrl+R",
    "description": "Open history search",
    "group": "History"
  },
  {
    "action": "history:previous",
    "defaultKeys": "Up",
    "description": "Previous history item",
    "group": "History"
  },
  {
    "action": "history:next",
    "defaultKeys": "Down",
    "description": "Next history item",
    "group": "History"
  },
  {
    "action": "chat:cancel",
    "defaultKeys": "Escape",
    "description": "Cancel current input",
    "group": "Chat"
  },
  {
    "action": "chat:clearInput",
    "defaultKeys": "Ctrl+L",
    "description": "Force a full screen redraw, preserving input and conversation",
    "group": "Chat"
  },
  {
    "action": "chat:clearScreen",
    "defaultKeys": "Cmd+K",
    "description": "Same as chat:clearInput. See Clear the conversation for how Cmd+K behaves on iTerm2 and Terminal.app",
    "group": "Chat"
  },
  {
    "action": "chat:killAgents",
    "defaultKeys": "Ctrl+X Ctrl+K",
    "description": "Stop all running background subagents in this session and turn off artifact auto-replies for the rest of it. Press the shortcut twice within 3 seconds to confirm. You can press it while a background subagent's permission prompt is open",
    "group": "Chat"
  },
  {
    "action": "chat:cycleMode",
    "defaultKeys": "Shift+Tab*",
    "description": "Cycle permission modes",
    "group": "Chat"
  },
  {
    "action": "chat:modelPicker",
    "defaultKeys": "Meta+P",
    "description": "Open model picker",
    "group": "Chat"
  },
  {
    "action": "chat:fastMode",
    "defaultKeys": "Meta+O",
    "description": "Toggle fast mode",
    "group": "Chat"
  },
  {
    "action": "chat:thinkingToggle",
    "defaultKeys": "Meta+T",
    "description": "Toggle extended thinking",
    "group": "Chat"
  },
  {
    "action": "chat:submit",
    "defaultKeys": "Enter",
    "description": "Submit message",
    "group": "Chat"
  },
  {
    "action": "chat:queueSubmit",
    "defaultKeys": "Ctrl+X Enter",
    "description": "Submit the message, marked to wait its turn: while Claude is working, Claude Code queues it and never interrupts the turn. Unlike chat:submit, it submits the draft even while an autocomplete suggestion is highlighted. Requires v2.1.247 or later",
    "group": "Chat"
  },
  {
    "action": "chat:sendNow",
    "defaultKeys": "Ctrl+Enter, Ctrl+X Ctrl+S",
    "description": "Send your queued messages, and your draft with them, right away. When Claude Code sends what you queued covers what happens to the turn Claude is working on. When nothing is running, the key submits the draft, and in shell mode it only queues the command. Terminals that don't report extended keys deliver Ctrl+Enter as plain Enter, so Ctrl+X Ctrl+S is the binding that works in any terminal. Requires v2.1.275 or later",
    "group": "Chat"
  },
  {
    "action": "chat:newline",
    "defaultKeys": "Ctrl+J",
    "description": "Insert a newline without submitting",
    "group": "Chat"
  },
  {
    "action": "chat:undo",
    "defaultKeys": "Ctrl+_, Ctrl+Shift+-",
    "description": "Undo last action",
    "group": "Chat"
  },
  {
    "action": "chat:externalEditor",
    "defaultKeys": "Ctrl+G, Ctrl+X Ctrl+E",
    "description": "Open in external editor. The agent view dispatch input follows this action's single-keystroke bindings too",
    "group": "Chat"
  },
  {
    "action": "chat:stash",
    "defaultKeys": "Ctrl+S",
    "description": "Stash current prompt",
    "group": "Chat"
  },
  {
    "action": "chat:imagePaste",
    "defaultKeys": "Ctrl+V (Alt+V on Windows and WSL)",
    "description": "Paste image from clipboard. On WSL, both shortcuts are bound by default",
    "group": "Chat"
  },
  {
    "action": "autocomplete:accept",
    "defaultKeys": "Tab",
    "description": "Accept suggestion",
    "group": "Autocomplete"
  },
  {
    "action": "autocomplete:dismiss",
    "defaultKeys": "Escape",
    "description": "Dismiss menu",
    "group": "Autocomplete"
  },
  {
    "action": "autocomplete:previous",
    "defaultKeys": "Up",
    "description": "Previous suggestion",
    "group": "Autocomplete"
  },
  {
    "action": "autocomplete:next",
    "defaultKeys": "Down",
    "description": "Next suggestion",
    "group": "Autocomplete"
  },
  {
    "action": "confirm:yes",
    "defaultKeys": "Enter",
    "description": "Confirm action",
    "group": "Confirmation"
  },
  {
    "action": "confirm:no",
    "defaultKeys": "Escape",
    "description": "Decline action",
    "group": "Confirmation"
  },
  {
    "action": "confirm:previous",
    "defaultKeys": "Up",
    "description": "Previous option",
    "group": "Confirmation"
  },
  {
    "action": "confirm:next",
    "defaultKeys": "Down",
    "description": "Next option",
    "group": "Confirmation"
  },
  {
    "action": "confirm:nextField",
    "defaultKeys": "Tab",
    "description": "In the /fast dialog, turn fast mode on or off",
    "group": "Confirmation"
  },
  {
    "action": "confirm:previousField",
    "defaultKeys": "(unbound)",
    "description": "Claude Code doesn't respond to this action, and a keybindings.json that names it remains valid",
    "group": "Confirmation"
  },
  {
    "action": "confirm:toggle",
    "defaultKeys": "Space",
    "description": "Toggle selection",
    "group": "Confirmation"
  },
  {
    "action": "confirm:cycleMode",
    "defaultKeys": "Shift+Tab*",
    "description": "On a file permission prompt, closes an open comment field; with no field open, selects the option that allows the action for the rest of the session, when the prompt offers that option",
    "group": "Confirmation"
  },
  {
    "action": "permission:toggleDebug",
    "defaultKeys": "(unbound)",
    "description": "Claude Code doesn't respond to this action, and a keybindings.json that names it remains valid",
    "group": "Permission"
  },
  {
    "action": "transcript:toggleShowAll",
    "defaultKeys": "Ctrl+E",
    "description": "Toggle show all content",
    "group": "Transcript"
  },
  {
    "action": "transcript:exit",
    "defaultKeys": "q, Ctrl+C, Escape",
    "description": "Exit transcript view",
    "group": "Transcript"
  },
  {
    "action": "historySearch:next",
    "defaultKeys": "Ctrl+R",
    "description": "Next match",
    "group": "History search"
  },
  {
    "action": "historySearch:accept",
    "defaultKeys": "Escape, Tab",
    "description": "Accept selection",
    "group": "History search"
  },
  {
    "action": "historySearch:cancel",
    "defaultKeys": "Ctrl+C",
    "description": "Cancel search",
    "group": "History search"
  },
  {
    "action": "historySearch:execute",
    "defaultKeys": "Enter",
    "description": "Execute selected command",
    "group": "History search"
  },
  {
    "action": "historySearch:cycleScope",
    "defaultKeys": "Ctrl+S",
    "description": "Cycle scope: session, project, everywhere",
    "group": "History search"
  },
  {
    "action": "task:background",
    "defaultKeys": "Ctrl+B, Ctrl+X Ctrl+B",
    "description": "Background current task",
    "group": "Task"
  },
  {
    "action": "theme:toggleSyntaxHighlighting",
    "defaultKeys": "Ctrl+T",
    "description": "Toggle syntax highlighting",
    "group": "Theme"
  },
  {
    "action": "help:dismiss",
    "defaultKeys": "Escape",
    "description": "Close help menu",
    "group": "Help"
  },
  {
    "action": "tabs:next",
    "defaultKeys": "Tab, Right",
    "description": "Next tab",
    "group": "Tabs"
  },
  {
    "action": "tabs:previous",
    "defaultKeys": "Shift+Tab, Left",
    "description": "Previous tab",
    "group": "Tabs"
  },
  {
    "action": "attachments:next",
    "defaultKeys": "Right",
    "description": "Next attachment",
    "group": "Attachments"
  },
  {
    "action": "attachments:previous",
    "defaultKeys": "Left",
    "description": "Previous attachment",
    "group": "Attachments"
  },
  {
    "action": "attachments:remove",
    "defaultKeys": "Backspace, Delete",
    "description": "Remove selected attachment",
    "group": "Attachments"
  },
  {
    "action": "attachments:exit",
    "defaultKeys": "Down, Escape",
    "description": "Exit attachment navigation",
    "group": "Attachments"
  },
  {
    "action": "footer:next",
    "defaultKeys": "Right",
    "description": "Next footer item",
    "group": "Footer"
  },
  {
    "action": "footer:previous",
    "defaultKeys": "Left",
    "description": "Previous footer item",
    "group": "Footer"
  },
  {
    "action": "footer:up",
    "defaultKeys": "Up, Ctrl+P",
    "description": "Navigate up in footer (deselects at top)",
    "group": "Footer"
  },
  {
    "action": "footer:down",
    "defaultKeys": "Down, Ctrl+N",
    "description": "Navigate down in footer",
    "group": "Footer"
  },
  {
    "action": "footer:openSelected",
    "defaultKeys": "Enter",
    "description": "Open selected footer item",
    "group": "Footer"
  },
  {
    "action": "footer:clearSelection",
    "defaultKeys": "Escape",
    "description": "Clear footer selection",
    "group": "Footer"
  },
  {
    "action": "footer:close",
    "defaultKeys": "x",
    "description": "Stop the selected agent or workflow, or dismiss its row if it's no longer running",
    "group": "Footer"
  },
  {
    "action": "footer:dismiss",
    "defaultKeys": "(unbound)",
    "description": "Binding a key to this action has no effect, and a keybindings.json that names it remains valid. Before v2.1.281, Backspace and Delete were bound to it and dismissed the selected artifact link from the footer.",
    "group": "Footer"
  },
  {
    "action": "diff:dismiss",
    "defaultKeys": "Escape",
    "description": "Close diff viewer; from the detail view, returns to the file list instead",
    "group": "Diff"
  },
  {
    "action": "diff:previousSource",
    "defaultKeys": "Left",
    "description": "Previous diff source",
    "group": "Diff"
  },
  {
    "action": "diff:nextSource",
    "defaultKeys": "Right",
    "description": "Next diff source",
    "group": "Diff"
  },
  {
    "action": "diff:previousFile",
    "defaultKeys": "Up, K",
    "description": "Previous file in the file list; scroll up one line in the detail view",
    "group": "Diff"
  },
  {
    "action": "diff:nextFile",
    "defaultKeys": "Down, J",
    "description": "Next file in the file list; scroll down one line in the detail view",
    "group": "Diff"
  },
  {
    "action": "diff:back",
    "defaultKeys": "(unbound)",
    "description": "Go back in diff viewer. Escape performs the back action via diff:dismiss. The previous default of Left in the detail view was removed in v2.1.203",
    "group": "Diff"
  },
  {
    "action": "scroll:pageUp",
    "defaultKeys": "PageUp",
    "description": "Scroll up half a viewport",
    "group": "Diff"
  },
  {
    "action": "scroll:pageDown",
    "defaultKeys": "PageDown",
    "description": "Scroll down half a viewport",
    "group": "Diff"
  },
  {
    "action": "scroll:fullPageUp",
    "defaultKeys": "Shift+Space, B",
    "description": "Scroll up a full viewport",
    "group": "Diff"
  },
  {
    "action": "scroll:fullPageDown",
    "defaultKeys": "Space",
    "description": "Scroll down a full viewport",
    "group": "Diff"
  },
  {
    "action": "scroll:top",
    "defaultKeys": "G, Home",
    "description": "Jump to the top",
    "group": "Diff"
  },
  {
    "action": "scroll:bottom",
    "defaultKeys": "Shift+G, End",
    "description": "Jump to the bottom",
    "group": "Diff"
  },
  {
    "action": "app:toggleReplTab",
    "defaultKeys": "(unbound)",
    "description": "Open or close the diff panel",
    "group": "Diff panel"
  },
  {
    "action": "app:cycleDiffBase",
    "defaultKeys": "Ctrl+X B",
    "description": "Cycle the panel's comparison base: this session, uncommitted, then branch",
    "group": "Diff panel"
  },
  {
    "action": "app:diffFileListUp",
    "defaultKeys": "Ctrl+Up, Meta+Up",
    "description": "Scroll the panel's file list up when it overflows",
    "group": "Diff panel"
  },
  {
    "action": "app:diffFileListDown",
    "defaultKeys": "Ctrl+Down, Meta+Down",
    "description": "Scroll the panel's file list down when it overflows",
    "group": "Diff panel"
  },
  {
    "action": "app:toggleDiffNoiseFilter",
    "defaultKeys": "(unbound)",
    "description": "Show or hide test and generated files in the panel",
    "group": "Diff panel"
  },
  {
    "action": "app:toggleDiffPreSession",
    "defaultKeys": "(unbound)",
    "description": "Expand or collapse the changes from before this session",
    "group": "Diff panel"
  },
  {
    "action": "modelPicker:decreaseEffort",
    "defaultKeys": "Left",
    "description": "Decrease effort level",
    "group": "Model picker"
  },
  {
    "action": "modelPicker:increaseEffort",
    "defaultKeys": "Right",
    "description": "Increase effort level",
    "group": "Model picker"
  },
  {
    "action": "modelPicker:thisSessionOnly",
    "defaultKeys": "s",
    "description": "Apply highlighted model to this session only",
    "group": "Model picker"
  },
  {
    "action": "effortSlider:decreaseEffort",
    "defaultKeys": "Left",
    "description": "Move the slider to the next lower effort level. Requires v2.1.284 or later",
    "group": "Effort slider"
  },
  {
    "action": "effortSlider:increaseEffort",
    "defaultKeys": "Right",
    "description": "Move the slider to the next higher effort level. Requires v2.1.284 or later",
    "group": "Effort slider"
  },
  {
    "action": "effortSlider:toggleUltracode",
    "defaultKeys": "Tab",
    "description": "Turn ultracode on or off for this session, when the slider offers it. Requires v2.1.284 or later",
    "group": "Effort slider"
  },
  {
    "action": "effortSlider:thisSessionOnly",
    "defaultKeys": "s",
    "description": "Apply the focused effort level to this session only. Requires v2.1.257 or later",
    "group": "Effort slider"
  },
  {
    "action": "select:next",
    "defaultKeys": "Down, J, Ctrl+N",
    "description": "Next option",
    "group": "Select"
  },
  {
    "action": "select:previous",
    "defaultKeys": "Up, K, Ctrl+P",
    "description": "Previous option",
    "group": "Select"
  },
  {
    "action": "select:pageUp",
    "defaultKeys": "PageUp",
    "description": "Move up one page of options",
    "group": "Select"
  },
  {
    "action": "select:pageDown",
    "defaultKeys": "PageDown",
    "description": "Move down one page of options",
    "group": "Select"
  },
  {
    "action": "select:first",
    "defaultKeys": "Home",
    "description": "First option",
    "group": "Select"
  },
  {
    "action": "select:last",
    "defaultKeys": "End",
    "description": "Last option",
    "group": "Select"
  },
  {
    "action": "select:accept",
    "defaultKeys": "Enter",
    "description": "Accept selection",
    "group": "Select"
  },
  {
    "action": "select:cancel",
    "defaultKeys": "Escape",
    "description": "Cancel selection",
    "group": "Select"
  },
  {
    "action": "plugin:toggle",
    "defaultKeys": "Space",
    "description": "Toggle plugin selection",
    "group": "Plugin"
  },
  {
    "action": "plugin:install",
    "defaultKeys": "I",
    "description": "Install selected plugins",
    "group": "Plugin"
  },
  {
    "action": "plugin:favorite",
    "defaultKeys": "F",
    "description": "Favorite the selected plugin so it sorts near the top of the Installed tab",
    "group": "Plugin"
  },
  {
    "action": "abovePrompt:toggle",
    "defaultKeys": "Ctrl+X Ctrl+A",
    "description": "Collapse the band to a one-row hint, or expand it again",
    "group": "Above-prompt"
  },
  {
    "action": "abovePrompt:focus",
    "defaultKeys": "Ctrl+X Tab",
    "description": "Move keyboard focus into the band, then to each open pane, and from the last pane back to the prompt",
    "group": "Above-prompt"
  },
  {
    "action": "abovePrompt:next",
    "defaultKeys": "Tab",
    "description": "Focus the next control",
    "group": "Above-prompt"
  },
  {
    "action": "abovePrompt:previous",
    "defaultKeys": "Shift+Tab",
    "description": "Focus the previous control",
    "group": "Above-prompt"
  },
  {
    "action": "abovePrompt:press",
    "defaultKeys": "Enter",
    "description": "Press the focused button, submit the focused input field, or pick the highlighted option in a select",
    "group": "Above-prompt"
  },
  {
    "action": "abovePrompt:leave",
    "defaultKeys": "Escape",
    "description": "Return keyboard focus to the prompt",
    "group": "Above-prompt"
  },
  {
    "action": "abovePrompt:highlightNext",
    "defaultKeys": "Down",
    "description": "Highlight the next option in a focused select",
    "group": "Above-prompt"
  },
  {
    "action": "abovePrompt:highlightPrevious",
    "defaultKeys": "Up",
    "description": "Highlight the previous option in a focused select",
    "group": "Above-prompt"
  },
  {
    "action": "pane:scrollUp",
    "defaultKeys": "Up",
    "description": "Scroll the pane up when it has more rows than it can show",
    "group": "Pane"
  },
  {
    "action": "pane:scrollDown",
    "defaultKeys": "Down",
    "description": "Scroll the pane down when it has more rows than it can show",
    "group": "Pane"
  },
  {
    "action": "pane:pageUp",
    "defaultKeys": "PageUp",
    "description": "Scroll the pane up a page",
    "group": "Pane"
  },
  {
    "action": "pane:pageDown",
    "defaultKeys": "PageDown",
    "description": "Scroll the pane down a page",
    "group": "Pane"
  },
  {
    "action": "pane:top",
    "defaultKeys": "Home",
    "description": "Jump to the top of the pane",
    "group": "Pane"
  },
  {
    "action": "pane:bottom",
    "defaultKeys": "End",
    "description": "Jump to the bottom of the pane",
    "group": "Pane"
  },
  {
    "action": "pane:grow",
    "defaultKeys": "Ctrl+X Left, Ctrl+X Up",
    "description": "Give the pane more room: width when it sits beside the transcript, height when it sits above the prompt",
    "group": "Pane"
  },
  {
    "action": "pane:shrink",
    "defaultKeys": "Ctrl+X Right, Ctrl+X Down",
    "description": "Give the pane less room: width when it sits beside the transcript, height when it sits above the prompt",
    "group": "Pane"
  },
  {
    "action": "pane:close",
    "defaultKeys": "Ctrl+X X",
    "description": "Close the pane",
    "group": "Pane"
  },
  {
    "action": "pane:next",
    "defaultKeys": "(unbound)",
    "description": "Show the next open pane",
    "group": "Pane"
  },
  {
    "action": "pane:previous",
    "defaultKeys": "(unbound)",
    "description": "Show the previous open pane",
    "group": "Pane"
  },
  {
    "action": "settings:search",
    "defaultKeys": "/",
    "description": "Enter search mode",
    "group": "Settings"
  },
  {
    "action": "settings:retry",
    "defaultKeys": "R",
    "description": "Retry loading usage data on error",
    "group": "Settings"
  },
  {
    "action": "agents:switchView",
    "defaultKeys": "Ctrl+S",
    "description": "Switch session grouping between state and directory",
    "group": "Agents"
  },
  {
    "action": "agents:togglePin",
    "defaultKeys": "Ctrl+T",
    "description": "Pin or unpin the selected session",
    "group": "Agents"
  },
  {
    "action": "agents:find",
    "defaultKeys": "Ctrl+F",
    "description": "Find sessions by name, with the n: filter. Requires v2.1.288 or later",
    "group": "Agents"
  },
  {
    "action": "agents:rename",
    "defaultKeys": "Ctrl+R",
    "description": "Rename the selected session. Requires v2.1.288 or later",
    "group": "Agents"
  },
  {
    "action": "agents:previousGroup",
    "defaultKeys": "Ctrl+Up, Meta+Up",
    "description": "Jump to the previous group header. Requires v2.1.288 or later",
    "group": "Agents"
  },
  {
    "action": "agents:nextGroup",
    "defaultKeys": "Ctrl+Down, Meta+Down",
    "description": "Jump to the next group header. Requires v2.1.288 or later",
    "group": "Agents"
  },
  {
    "action": "voice:pushToTalk",
    "defaultKeys": "Space",
    "description": "Dictate a prompt. Hold or tap depending on /voice mode",
    "group": "Voice"
  },
  {
    "action": "scroll:lineUp",
    "defaultKeys": "wheelup",
    "description": "Scroll up one line. Mouse wheel scrolling triggers this action",
    "group": "Scroll"
  },
  {
    "action": "scroll:lineDown",
    "defaultKeys": "wheeldown",
    "description": "Scroll down one line. Mouse wheel scrolling triggers this action",
    "group": "Scroll"
  },
  {
    "action": "scroll:halfPageUp",
    "defaultKeys": "(unbound)",
    "description": "Scroll up half the viewport height. Same behavior as scroll:pageUp, provided for vi-style rebinds",
    "group": "Scroll"
  },
  {
    "action": "scroll:halfPageDown",
    "defaultKeys": "(unbound)",
    "description": "Scroll down half the viewport height. Same behavior as scroll:pageDown, provided for vi-style rebinds",
    "group": "Scroll"
  },
  {
    "action": "selection:copy",
    "defaultKeys": "Ctrl+Shift+C / Cmd+C",
    "description": "Copy the selected text to the clipboard",
    "group": "Scroll"
  },
  {
    "action": "selection:clear",
    "defaultKeys": "(unbound)",
    "description": "Clear the active text selection. Requires v2.1.234 or later",
    "group": "Scroll"
  },
  {
    "action": "selection:extendLeft",
    "defaultKeys": "Shift+Left",
    "description": "Extend the active selection one column left",
    "group": "Scroll"
  },
  {
    "action": "selection:extendRight",
    "defaultKeys": "Shift+Right",
    "description": "Extend the active selection one column right",
    "group": "Scroll"
  },
  {
    "action": "selection:extendUp",
    "defaultKeys": "Shift+Up",
    "description": "Extend the active selection one row up. Scrolls the viewport when the selection reaches the top edge",
    "group": "Scroll"
  },
  {
    "action": "selection:extendDown",
    "defaultKeys": "Shift+Down",
    "description": "Extend the active selection one row down. Scrolls the viewport when the selection reaches the bottom edge",
    "group": "Scroll"
  },
  {
    "action": "selection:extendLineStart",
    "defaultKeys": "Shift+Home",
    "description": "Extend the active selection to the start of the line",
    "group": "Scroll"
  },
  {
    "action": "selection:extendLineEnd",
    "defaultKeys": "Shift+End",
    "description": "Extend the active selection to the end of the line",
    "group": "Scroll"
  }
];
