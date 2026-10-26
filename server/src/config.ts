import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { configPath } from "./fs/paths";

export interface AppConfig {
  projectRoots: string[]; // "~/projects" style; expanded when used
  port: number;
  lan: { enabled: boolean; passwordHash: string | null };
  sessionSecret: string;
}

const defaults = (): AppConfig => ({
  projectRoots: ["~/projects"],
  port: 4317,
  lan: { enabled: false, passwordHash: null },
  sessionSecret: crypto.randomUUID() + crypto.randomUUID(),
});

let cached: AppConfig | null = null;

export async function getConfig(): Promise<AppConfig> {
  if (cached) return cached;
  let stored: Partial<AppConfig> = {};
  try {
    stored = JSON.parse(await readFile(configPath(), "utf8"));
  } catch {
    /* first run */
  }
  const d = defaults();
  cached = { ...d, ...stored, lan: { ...d.lan, ...stored.lan } };
  if (!stored.sessionSecret) await saveConfig(cached);
  return cached;
}

export async function saveConfig(c: AppConfig) {
  cached = c;
  await mkdir(dirname(configPath()), { recursive: true });
  const tmp = configPath() + ".tmp";
  await writeFile(tmp, JSON.stringify(c, null, 2), { mode: 0o600 });
  await rename(tmp, configPath());
}

/** The config as the browser may see it. */
export const publicConfig = (c: AppConfig) => ({
  projectRoots: c.projectRoots,
  port: c.port,
  lan: { enabled: c.lan.enabled, hasPassword: !!c.lan.passwordHash },
});
