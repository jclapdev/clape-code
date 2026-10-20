import { Hono } from "hono";
import { cancelLogin, loginState, logout, sendCode, startLogin } from "../account/login";
import { readAccount } from "../account/status";
import { WriteError } from "../fs/safeWrite";
import { projectDir } from "../scan/projects";
import type { Env } from "./env";

export const account = new Hono<Env>();

async function folderOf(project: string | undefined) {
  if (!project) return undefined;
  const dir = await projectDir(project);
  if (!dir) throw new WriteError(404, "Unknown project.");
  return dir;
}

/** The account Claude Code uses, for every project or in one project's folder. Picked fields only. */
account.get("/account", async (c) => c.json(await readAccount(await folderOf(c.req.query("project")))));

account.get("/account/login", (c) => c.json(loginState()));
account.post("/account/login", async (c) => c.json(await startLogin()));
account.post("/account/login/code", async (c) => {
  const { code } = await c.req.json().catch(() => ({ code: "" }));
  return c.json(sendCode(code));
});
account.delete("/account/login", (c) => c.json(cancelLogin()));
account.post("/account/logout", async (c) => c.json(await logout()));
