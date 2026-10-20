import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { appDir } from "../fs/paths";
import { planName, providerName } from "./status";

// The account each session the app starts runs on, from the Agent SDK's `accountInfo()` at the session's start.
// Transcripts don't record it, so sessions started elsewhere have none. Kept in the app folder by session id.

export interface SessionAccount {
  provider: string;
  providerName: string;
  email: string | null;
  organization: string | null;
  plan: string | null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Only these fields are kept; `accountInfo()` also names where the token came from. */
export function pickSessionAccount(info: unknown): SessionAccount {
  const o = (info && typeof info === "object" ? info : {}) as Record<string, unknown>;
  const provider = str(o.apiProvider) ?? str(o.provider) ?? "firstParty";
  return { provider, providerName: providerName(provider), email: str(o.email), organization: str(o.organization), plan: planName(o.subscriptionType ?? o.plan) };
}

const file = () => join(appDir(), "session-accounts.json");
let queue: Promise<unknown> = Promise.resolve();

async function readAll(): Promise<Record<string, SessionAccount>> {
  try {
    const raw = JSON.parse(await readFile(file(), "utf8"));
    return Object.fromEntries(Object.entries(raw && typeof raw === "object" ? raw : {}).map(([k, v]) => [k, pickSessionAccount(v)]));
  } catch {
    return {};
  }
}

/** Every saved account by session id, each re-picked so nothing else in the file reaches the browser. */
export const sessionAccounts = () => readAll();

export function saveSessionAccount(sessionId: string, info: unknown): Promise<void> {
  const next = queue.then(async () => {
    const all = await readAll();
    all[sessionId] = pickSessionAccount(info);
    await mkdir(appDir(), { recursive: true });
    const tmp = file() + ".tmp";
    await writeFile(tmp, JSON.stringify(all, null, 2));
    await rename(tmp, file());
  });
  queue = next.catch(() => {});
  return next;
}
