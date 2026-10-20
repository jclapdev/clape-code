import { MISSING_CLAUDE, runClaude } from "../live/claude";

// Which account Claude Code uses, from `claude auth status`. Only these fields ever reach the browser: the raw
// output also names folders and an organization id, and later versions may add more.

export interface AccountStatus {
  /** null for a cloud provider: Claude Code reports those as logged in without checking their credentials. */
  loggedIn: boolean | null;
  method: string;
  methodName: string;
  provider: string;
  providerName: string;
  email: string | null;
  organization: string | null;
  plan: string | null;
}

export interface AccountView extends AccountStatus {
  installed: boolean;
  problem: string | null;
}

// Names from the authentication and provider pages of the Claude Code docs.
const METHODS: Record<string, string> = {
  none: "Not signed in",
  "claude.ai": "Claude account",
  oauth_token: "Long-lived Claude token",
  api_key: "API key",
  api_key_helper: "API key from a helper script",
};
const PROVIDERS: Record<string, string> = {
  firstParty: "Anthropic",
  bedrock: "Amazon Bedrock",
  vertex: "Google Cloud's Agent Platform",
  foundry: "Microsoft Foundry",
  anthropicAws: "Claude Platform on AWS",
  mantle: "Amazon Bedrock (Mantle)",
  gateway: "Claude apps gateway",
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** "pro" → "Claude Pro"; the SDK already says "Claude Pro". */
export function planName(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  if (/^claude\b/i.test(s)) return s;
  return `Claude ${s.charAt(0).toUpperCase()}${s.slice(1)}`;
}

export const providerName = (p: string) => PROVIDERS[p] ?? p;

export function pickStatus(raw: unknown): AccountStatus {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const method = str(o.authMethod) ?? "none";
  const provider = str(o.apiProvider) ?? "firstParty";
  const cloud = method === "third_party";
  return {
    loggedIn: cloud ? null : o.loggedIn === true,
    method,
    methodName: cloud ? providerName(provider) : (METHODS[method] ?? method),
    provider,
    providerName: providerName(provider),
    email: str(o.email),
    organization: str(o.orgName),
    plan: planName(o.subscriptionType),
  };
}

const empty = (problem: string, installed: boolean): AccountView => ({ ...pickStatus({}), loggedIn: null, installed, problem });

/** The account Claude Code uses when started in `cwd` (a project's settings can switch the provider). */
export async function readAccount(cwd?: string): Promise<AccountView> {
  let r: Awaited<ReturnType<typeof runClaude>>;
  try {
    r = await runClaude(["auth", "status", "--json"], cwd, 30_000);
  } catch (e: any) {
    return empty(String(e?.message ?? e), e?.message !== MISSING_CLAUDE);
  }
  try {
    return { ...pickStatus(JSON.parse(r.out)), installed: true, problem: null };
  } catch {
    return empty((r.err || r.out).trim().split("\n")[0] || "Claude Code didn't say which account it uses.", true);
  }
}
