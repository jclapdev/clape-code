// Turns errors into sentences a person can act on. Raw system codes and stack text stay in the server log.

export const MISSING_FILE = "This file no longer exists. It may have been moved or deleted.";
export const NO_PERMISSION = "The app doesn't have permission to open this file.";
export const UNKNOWN = "Something went wrong on the server. Try again.";

const BY_CODE: Record<string, { status: number; error: string }> = {
  ENOENT: { status: 404, error: MISSING_FILE },
  EACCES: { status: 403, error: NO_PERMISSION },
  EPERM: { status: 403, error: NO_PERMISSION },
  EISDIR: { status: 400, error: "That's a folder, not a file." },
  ENOSPC: { status: 507, error: "The disk is full, so the file couldn't be saved." },
  EBUSY: { status: 409, error: "Another program is using this file. Close it and try again." },
};

/** The status and message to send for an error the routes didn't expect. */
export function errorResponse(err: unknown): { status: number; error: string } {
  const code = (err as { code?: string } | null)?.code;
  return (code && BY_CODE[code]) || { status: 500, error: UNKNOWN };
}

/** Where strict JSON first goes wrong, as a sentence; null when the text is valid JSON. */
export function jsonProblem(text: string): string | null {
  try {
    JSON.parse(text);
    return null;
  } catch {
    /* find the place below */
  }
  const at = firstBadIndex(text);
  const line = text.slice(0, at).split("\n").length;
  const near = (text.split("\n")[line - 1] ?? "").trim();
  return near ? `This isn't valid JSON. Line ${line} has a mistake near: ${near}` : `This isn't valid JSON. Line ${line} has a mistake.`;
}

// A small strict-JSON walker that only reports where parsing stops.
function firstBadIndex(s: string): number {
  let i = 0;
  const ws = () => {
    while (i < s.length && " \t\r\n".includes(s[i]!)) i++;
  };
  const fail = (): never => {
    throw i;
  };
  const str = () => {
    if (s[i] !== '"') fail();
    i++;
    while (i < s.length && s[i] !== '"') {
      if (s[i] === "\n") fail();
      i += s[i] === "\\" ? 2 : 1;
    }
    if (s[i] !== '"') fail();
    i++;
  };
  const value = (): void => {
    ws();
    const c = s[i];
    if (c === "{") {
      i++;
      ws();
      if (s[i] === "}") return void i++;
      for (;;) {
        ws();
        str();
        ws();
        if (s[i] !== ":") fail();
        i++;
        value();
        ws();
        if (s[i] === ",") {
          i++;
          continue;
        }
        if (s[i] === "}") return void i++;
        fail();
      }
    }
    if (c === "[") {
      i++;
      ws();
      if (s[i] === "]") return void i++;
      for (;;) {
        value();
        ws();
        if (s[i] === ",") {
          i++;
          continue;
        }
        if (s[i] === "]") return void i++;
        fail();
      }
    }
    if (c === '"') return str();
    const m = /^(true|false|null|-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?)/.exec(s.slice(i));
    if (!m) fail();
    i += m![0].length;
  };
  try {
    value();
    ws();
    if (i < s.length) fail();
    return s.length;
  } catch (at) {
    return typeof at === "number" ? Math.min(at, s.length) : s.length;
  }
}
