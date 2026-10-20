// Desktop entry point: runs the Control Center server inside this process and shows it in a native window.
// Electrobun bundles this file into the app, so the built web app is copied in by electrobun.config.ts
// (build.copy) and handed to the server the same way the compiled executable does it.
import Electrobun, { BrowserWindow } from "electrobun/main";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { main } from "../../server/src/index";
import { stopAll } from "../../server/src/live/sessions";

const PORT = 4317;
const URL = `http://127.0.0.1:${PORT}`;

/** Is a Control Center already answering on the port? Then this launch is a second copy. */
async function alreadyRunning(): Promise<boolean> {
  try {
    await fetch(`${URL}/api/config`, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

/** URL path -> file path for every file of the built web app copied into the bundle. */
function webAssets(dir: string): Record<string, string> {
  const map: Record<string, string> = {};
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else map["/" + relative(dir, p).split(sep).join("/")] = p;
    }
  };
  walk(dir);
  return map;
}

if (await alreadyRunning()) {
  console.log(`Control Center is already running at ${URL}.`);
  process.exit(0);
}

globalThis.__CC_ASSETS = webAssets(join(import.meta.dir, "..", "web"));
process.env.PORT = String(PORT);
await main({ open: false });

const win = new BrowserWindow({
  title: "Control Center",
  url: URL,
  frame: { width: 1440, height: 900 },
});

// Clicking the Dock icon while the window is minimised or behind others brings it forward.
Electrobun.events.on("reopen", () => win.activate());

// Closing the last window quits the app (Electrobun's default), and the server runs in this process,
// so it stops with it. Live Claude sessions are child processes: stop them first.
Electrobun.events.on("before-quit", () => stopAll());
