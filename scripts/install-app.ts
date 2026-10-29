// Last step of `bun run app`: on macOS, copies the release build into ~/Applications so it shows in
// Launchpad and Spotlight, replacing an older copy. Elsewhere it says where the build is.
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const NAME = "Clape Code";
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

const run = (cmd: string[]) => {
  const r = Bun.spawnSync(cmd, { stdout: "inherit", stderr: "inherit" });
  if (r.exitCode !== 0) process.exit(r.exitCode ?? 1);
};

// The release build is a wrapper that unpacks the real app from a .tar.zst on its first launch, showing an
// "Installation complete" box over a blank window. Unpack it here instead, so the first launch is a normal one.
let built = join(out, `${NAME}.app`);
const resources = join(built, "Contents", "Resources");
const packed = readdirSync(resources).find((f) => f.endsWith(".tar.zst"));
const unpacked = join(out, "unpacked");
rmSync(unpacked, { recursive: true, force: true });
if (packed) {
  mkdirSync(unpacked);
  run(["tar", "-xf", join(resources, packed), "-C", unpacked]);
  built = join(unpacked, `${NAME}.app`);
}

const apps = join(homedir(), "Applications");
const target = join(apps, `${NAME}.app`);
if (existsSync(target)) rmSync(target, { recursive: true, force: true });
// The app was called Control Center: remove that copy so only one is in Applications.
rmSync(join(apps, "Control Center.app"), { recursive: true, force: true });
// ditto keeps the bundle's symlinks, permissions and extended attributes.
run(["ditto", built, target]);
rmSync(unpacked, { recursive: true, force: true });
console.log(`Installed ${target}. Open ${NAME} from Applications or Spotlight.`);
