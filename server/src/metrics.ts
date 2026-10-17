import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { appDir } from "./fs/paths";

// Local-only counts for the post-launch review: which views get used, edits saved,
// conflicts caught, sessions answered from the browser. Nothing leaves this machine.
const file = () => join(appDir(), "metrics.json");
export const feedbackFile = () => join(appDir(), "feedback.md");

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

export async function addFeedback(text: string) {
  await mkdir(appDir(), { recursive: true });
  await appendFile(feedbackFile(), `- ${new Date().toISOString().slice(0, 16).replace("T", " ")} ${text.replace(/\s+/g, " ").trim()}\n`);
}

export async function readFeedback(): Promise<string> {
  return readFile(feedbackFile(), "utf8").catch(() => "");
}
