import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { generate } from "selfsigned";
import { getConfig } from "./config";
import { appDir } from "./fs/paths";

// Two modes:
//  - This machine only (default): the server listens on 127.0.0.1. Requests must name a loopback
//    host (blocks DNS-rebinding pages) and state-changing requests must come from the app's own origin.
//  - Home network: the server listens on all interfaces over HTTPS and every request from another
//    device needs the login cookie. Requests from this machine itself skip the login.

export const COOKIE = "cc_session";
const WEEK = 7 * 24 * 3600 * 1000;

const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export async function issueToken(): Promise<string> {
  const { sessionSecret } = await getConfig();
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + WEEK })).toString("base64url");
  return `${payload}.${sign(payload, sessionSecret)}`;
}

export async function verifyToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const { sessionSecret } = await getConfig();
  const expected = Buffer.from(sign(payload, sessionSecret));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return false;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now();
  } catch {
    return false;
  }
}

export const isLoopbackAddr = (ip: string | undefined) => !!ip && (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1");
const isLoopbackHost = (host: string) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);

/** Requests per IP in the last minute, for login rate limiting. */
const attempts = new Map<string, number[]>();
export function allowLoginAttempt(ip: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 5) {
    attempts.set(ip, recent);
    return false;
  }
  recent.push(now);
  attempts.set(ip, recent);
  return true;
}
export const resetLoginAttempts = () => attempts.clear();

export function guard(getIp: (c: Context) => string | undefined) {
  return async (c: Context, next: Next) => {
    const cfg = await getConfig();
    const host = c.req.header("host") ?? "";
    const ip = getIp(c);
    const local = isLoopbackAddr(ip);

    if (!cfg.lan.enabled && !isLoopbackHost(host)) return c.text("Forbidden host", 403);

    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const origin = c.req.header("origin");
      if (origin) {
        let ok = false;
        try {
          ok = new URL(origin).host === host;
        } catch {}
        if (!ok) return c.json({ error: "Cross-site request refused." }, 403);
      }
    }

    const path = new URL(c.req.url).pathname;
    if (cfg.lan.enabled && !local && path.startsWith("/api/") && !path.startsWith("/api/auth/")) {
      if (!(await verifyToken(getCookie(c, COOKIE)))) return c.json({ error: "Login required." }, 401);
    }
    c.set("isLocal", local);
    c.set("ip", ip ?? "unknown");
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Frame-Options", "DENY");
  };
}

/** Self-signed certificate for home-network mode, created once and kept in the app folder. */
export async function tlsFiles(): Promise<{ key: string; cert: string }> {
  const dir = join(appDir(), "tls");
  try {
    return { key: await readFile(join(dir, "key.pem"), "utf8"), cert: await readFile(join(dir, "cert.pem"), "utf8") };
  } catch {
    const notAfterDate = new Date(Date.now() + 3 * 365 * 24 * 3600 * 1000);
    const pems = await generate([{ name: "commonName", value: "control-center.local" }], { keySize: 2048, algorithm: "sha256", notAfterDate });
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "key.pem"), pems.private, { mode: 0o600 });
    await writeFile(join(dir, "cert.pem"), pems.cert);
    return { key: pems.private, cert: pems.cert };
  }
}
