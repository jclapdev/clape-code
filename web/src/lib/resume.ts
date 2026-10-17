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
