import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getConfig } from "./config";
import { appDir, untildify } from "./fs/paths";
import { readWithHash, safeWrite } from "./fs/safeWrite";

// Local-only counts for the post-launch review: which views get used, edits saved,
// conflicts caught, sessions answered from the browser. Nothing leaves this machine.
const file = () => join(appDir(), "metrics.json");

/** FEEDBACK.md in the repo by default, so the Iterate step can review it there. */
export const feedbackFile = async () => untildify((await getConfig()).feedbackFile);

let counts: Record<string, number> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

async function load() {
  if (counts) return counts;
  try {
    counts = JSON.parse(await readFile(file(), "utf8"));
  } catch {
    counts = {};
  }
  return counts!;
}

export async function bump(key: string) {
  const c = await load();
  c[key] = (c[key] ?? 0) + 1;
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    await mkdir(dirname(file()), { recursive: true });
    await writeFile(file() + ".tmp", JSON.stringify(counts, null, 2));
    await rename(file() + ".tmp", file());
  }, 1000);
}

export const getMetrics = async () => ({ ...(await load()) });

/** Append one dated note. Goes through safeWrite like every other change to a user's file. */
export async function addFeedback(text: string) {
  const path = await feedbackFile();
  const cur = await readWithHash(path);
  const base = cur?.content ?? "# Feedback\n\nNotes saved from Control Center's search box, oldest first.\n\n";
  const line = `- ${new Date().toISOString().slice(0, 16).replace("T", " ")} ${text.replace(/\s+/g, " ").trim()}\n`;
  await safeWrite(path, base.endsWith("\n") ? base + line : base + "\n" + line, cur?.hash ?? null);
}

export async function readFeedback(): Promise<string> {
  return readFile(await feedbackFile(), "utf8").catch(() => "");
}
