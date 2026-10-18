/** A shell command that resumes a session in its own folder; `~` is left unquoted so the shell expands it. */
export function resumeCommand(cwd: string | null, sessionId: string): string {
  if (!cwd) return `claude --resume ${sessionId}`;
  const dir = /\s/.test(cwd) ? `"${cwd.replace(/^~/, "$HOME")}"` : cwd;
  return `cd ${dir} && claude --resume ${sessionId}`;
}

export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Copies a command and says so; when the browser blocks the clipboard, shows the command to copy by hand. */
export async function copyCommand(cmd: string) {
  const { toast } = await import("sonner");
  if (await copy(cmd)) toast.success("Command copied. Paste it into a terminal.");
  else toast.error("Couldn't copy. Here is the command to copy by hand:", { description: cmd, duration: 20000 });
}
