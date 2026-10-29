// Desktop entry point: runs the Clape Code server inside this process and shows it in a native window.
// Electrobun bundles this file into the app, so the built web app is copied in by electrobun.config.ts
// (build.copy) and handed to the server the same way the compiled executable does it.
import Electrobun, { ApplicationMenu, BrowserWindow } from "electrobun/main";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { localListening, main, serverAddress } from "../../server/src/index";
import { stopAll } from "../../server/src/live/sessions";

process.env.PORT = "4317";
// http://127.0.0.1:4318, the server's local-only listener. It runs in both home-network modes, so switching the
// mode from the window doesn't move the window's address (the main listener turns into https on all addresses).
const { localUrl: URL, localPort } = await serverAddress();

/** Is a Clape Code already answering at that address? Then this launch is a second copy. */
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
  console.log(`Clape Code is already running at ${URL}.`);
  process.exit(0);
}

globalThis.__CC_ASSETS = webAssets(join(import.meta.dir, "..", "web"));
await main({ open: false });

// macOS takes the first menu as the app menu. Roles are the operating system's own commands and shortcuts.
ApplicationMenu.setApplicationMenu([
  { label: "Clape Code", submenu: [{ role: "quit" }] },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
  { label: "Window", submenu: [{ role: "minimize" }, { role: "close" }] },
]);

// Without the local-only listener the window has nothing to show: say why instead of a blank page.
const failed = `<!doctype html><meta charset="utf-8"><meta name="color-scheme" content="light dark"><title>Clape Code</title>
<body style="font:15px/1.5 -apple-system,system-ui,sans-serif;max-width:560px;margin:80px auto;padding:0 24px">
<h1 style="font-size:20px">Clape Code couldn't start its window</h1>
<p>Port ${localPort} on this computer is already in use by another program, so the window can't connect to Clape Code.
Quit the program using port ${localPort}, then open Clape Code again.</p></body>`;

const win = new BrowserWindow({
  title: "Clape Code",
  ...(localListening() ? { url: URL } : { url: null, html: failed }),
  frame: { width: 1440, height: 900 },
});

// Clicking the Dock icon while the window is minimised or behind others brings it forward.
Electrobun.events.on("reopen", () => win.activate());

// Closing the last window quits the app (Electrobun's default), and the server runs in this process,
// so it stops with it. Live Claude sessions are child processes: stop them first.
Electrobun.events.on("before-quit", () => stopAll());
