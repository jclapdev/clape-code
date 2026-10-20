import type { Subprocess } from "bun";
import { claudeDir } from "../fs/paths";
import { WriteError } from "../fs/safeWrite";
import { claudeEnv, findClaude, MISSING_CLAUDE, runClaude } from "../live/claude";
import { readAccount } from "./status";

// Signing in with a Claude account through Claude Code's own `claude auth login`. Without a terminal it prints
// the sign-in address and waits for the code the browser shows (docs: authentication, "Paste code here if
// prompted"). The browser gets only the state, that address and Claude Code's last line; never the rest of
// its output, and the app never reads or stores the login itself.

export interface LoginState {
  state: "idle" | "waiting" | "checking" | "done" | "failed";
  url: string | null;
  message: string | null;
}

const TEN_MINUTES = 10 * 60_000;
let proc: Subprocess<"pipe", "pipe", "pipe"> | null = null;
let current: LoginState = { state: "idle", url: null, message: null };
let timer: ReturnType<typeof setTimeout> | null = null;
/** How much output there was when the last code was sent; what comes after is Claude Code's answer to it. */
let sentAt = Infinity;
let outLength = 0;

export const loginState = (): LoginState => ({ ...current });
/** For tests: the running `claude auth login`. */
export const currentProcess = () => proc;

function stop() {
  if (timer) clearTimeout(timer);
  timer = null;
  const p = proc;
  proc = null;
  if (p && p.exitCode === null) p.kill();
}

export function cancelLogin(): LoginState {
  stop();
  current = { state: "idle", url: null, message: null };
  return loginState();
}

const lastLine = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/^Paste code here if prompted >\s*/, "").trim())
    .filter(Boolean)
    .at(-1) ?? null;

/** Starts `claude auth login --claudeai` and resolves once it has printed the sign-in address (or ended). */
export async function startLogin(opts: { timeoutMs?: number } = {}): Promise<LoginState> {
  stop();
  const claude = findClaude();
  if (!claude) throw new WriteError(400, MISSING_CLAUDE);
  const p = Bun.spawn([claude, "auth", "login", "--claudeai"], { cwd: claudeDir(), env: claudeEnv(), stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  proc = p;
  current = { state: "waiting", url: null, message: null };
  let out = "";
  sentAt = Infinity;
  const mine = () => proc === p;

  // Claude Code prints the address on stdout and its answers to a code ("Invalid code…", "Login failed…") on
  // stderr, so both are read as they arrive into one log.
  let gotUrl!: () => void;
  const urlSeen = new Promise<void>((r) => (gotUrl = r));
  const read = async (stream: ReadableStream<Uint8Array>) => {
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      out += decoder.decode(chunk, { stream: true });
      if (!mine()) continue;
      outLength = out.length;
      const m = out.match(/https:\/\/\S+/);
      if (m && !current.url) {
        current = { ...current, url: m[0] };
        gotUrl();
      }
      // A malformed code is rejected on the spot and Claude Code keeps waiting for another.
      const said = lastLine(out.slice(sentAt));
      if (current.state === "checking" && said && !/^Login failed/.test(said)) current = { ...current, state: "waiting", message: said };
    }
  };
  const reading = Promise.all([read(p.stdout), read(p.stderr)]);

  void p.exited.then(async (code) => {
    await reading;
    if (!mine()) return;
    if (timer) clearTimeout(timer);
    proc = null;
    current = code === 0 ? { state: "done", url: null, message: lastLine(out) ?? "Signed in." } : { state: "failed", url: null, message: lastLine(out) ?? "Sign-in didn't finish." };
  });

  timer = setTimeout(() => {
    if (!mine()) return;
    stop();
    current = { state: "failed", url: null, message: "Sign-in took too long and was stopped. Start it again." };
  }, opts.timeoutMs ?? TEN_MINUTES);

  await Promise.race([urlSeen, p.exited.then(() => reading).then(() => Bun.sleep(10)), Bun.sleep(30_000)]);
  return loginState();
}

/** Passes the code from the browser's sign-in page to the waiting `claude auth login`. */
export function sendCode(raw: unknown): LoginState {
  const code = typeof raw === "string" ? raw.trim() : "";
  if (!code) throw new WriteError(400, "Paste the code from the sign-in page.");
  if (code.length > 2000 || /[\r\n]/.test(code)) throw new WriteError(400, "That isn't a sign-in code. Copy just the code from the sign-in page.");
  if (!proc || current.state !== "waiting") throw new WriteError(409, "No sign-in is waiting for a code. Start it again.");
  sentAt = outLength;
  proc.stdin.write(code + "\n");
  proc.stdin.flush();
  current = { ...current, state: "checking", message: null };
  return loginState();
}

/** `claude auth logout`, only for a Claude account: the docs say logout is unavailable on cloud providers. */
export async function logout(): Promise<{ message: string }> {
  const a = await readAccount();
  if (!a.installed) throw new WriteError(400, a.problem ?? MISSING_CLAUDE);
  if (a.method !== "claude.ai") throw new WriteError(400, `Sign out is only for a Claude account. Claude Code uses ${a.methodName} here.`);
  const r = await runClaude(["auth", "logout"]);
  const message = lastLine(r.out) ?? lastLine(r.err) ?? "";
  if (r.code !== 0) throw new WriteError(400, message || "Claude Code couldn't sign out.");
  return { message };
}
