// Part of `bun run typecheck`: checks the desktop entry point (src/bun) and electrobun.config.ts.
// Electrobun's types are generated into .hutch/devkit by the first desktop build, so without it this says so.
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
if (!existsSync(join(root, ".hutch", "devkit"))) {
  console.log("desktop code not checked: run `bun run desktop` or `bun run app` once first");
  process.exit(0);
}
const tsc = join(root, "server", "node_modules", "typescript", "bin", "tsc");
const r = Bun.spawnSync([process.execPath, tsc, "-p", join(root, "tsconfig.json")], { stdout: "inherit", stderr: "inherit" });
if (r.exitCode === 0) console.log("desktop typecheck: ok");
process.exit(r.exitCode ?? 1);
