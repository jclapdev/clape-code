import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Writes a launcher for fixtures/fake-claude.ts into `dir` and points CC_CLAUDE_BIN at it. */
export async function installFakeClaude(dir: string): Promise<string> {
  const script = join(import.meta.dir, "fixtures", "fake-claude.ts");
  const win = process.platform === "win32";
  await mkdir(join(dir, "bin"), { recursive: true });
  const bin = join(dir, "bin", win ? "claude.cmd" : "claude");
  await writeFile(bin, win ? `@"${process.execPath}" "${script}" %*\r\n` : `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
  if (!win) await chmod(bin, 0o755);
  process.env.CC_CLAUDE_BIN = bin;
  return bin;
}
