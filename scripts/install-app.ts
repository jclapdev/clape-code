// Last step of `bun run app`: on macOS, copies the release build into ~/Applications so it shows in
// Launchpad and Spotlight, replacing an older copy. Elsewhere it says where the build is.
import { existsSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const NAME = "Control Center";
const buildDir = join(import.meta.dir, "..", "build");
const release = readdirSync(buildDir).find((d) => d.startsWith("stable-"));
if (!release) {
  console.error(`No release build in ${buildDir}. Run \`bun run app\`.`);
  process.exit(1);
}
const out = join(buildDir, release);

if (process.platform !== "darwin") {
  console.log(`Built ${NAME} in ${out}. The installer is in ${join(buildDir, "..", "artifacts")}.`);
  process.exit(0);
}

const built = join(out, `${NAME}.app`);
const apps = join(homedir(), "Applications");
const target = join(apps, `${NAME}.app`);
if (existsSync(target)) rmSync(target, { recursive: true, force: true });
// ditto keeps the bundle's symlinks, permissions and extended attributes.
const r = Bun.spawnSync(["ditto", built, target], { stdout: "inherit", stderr: "inherit" });
if (r.exitCode !== 0) process.exit(r.exitCode ?? 1);
console.log(`Installed ${target}. Open ${NAME} from Applications or Spotlight.`);
