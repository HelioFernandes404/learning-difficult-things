import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const COOKIE = "ldt_session";
export const MAX_AGE = 30 * 24 * 3600;

let secret: Buffer | null = null;
function getSecret(): Buffer {
  if (secret) return secret;
  if (process.env.SESSION_SECRET) return (secret = Buffer.from(process.env.SESSION_SECRET));
  const dir = path.join(process.cwd(), "data");
  const file = path.join(dir, ".session-secret");
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(file, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 });
  } catch {
    /* already exists */
  }
  return (secret = Buffer.from(fs.readFileSync(file, "utf8").trim()));
}

const sign = (exp: string) =>
  createHmac("sha256", getSecret()).update(`v1.${exp}.${createHash("sha256").update(process.env.APP_PASSWORD ?? "").digest("hex")}`).digest("hex");

/** Changing APP_PASSWORD invalidates old sessions. */
export function makeToken(): string {
  const exp = String(Date.now() + MAX_AGE * 1000);
  return `${exp}.${sign(exp)}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token || !process.env.APP_PASSWORD) return false;
  const [exp, mac] = token.split(".");
  if (!exp || !mac || !(Number(exp) > Date.now())) return false;
  const a = Buffer.from(mac);
  const b = Buffer.from(sign(exp));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function passwordOk(input: string): boolean {
  const pw = process.env.APP_PASSWORD ?? "";
  if (!pw) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(pw).digest();
  return timingSafeEqual(a, b);
}

const tries = new Map<string, number[]>();
/** 5 attempts per minute per IP (in memory). Returns true if the request should be blocked. */
export function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (tries.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  tries.set(ip, recent);
  if (tries.size > 1000) for (const [k, v] of tries) if (!v.some((t) => now - t < 60_000)) tries.delete(k);
  return recent.length > 5;
}

/** Refuses to start exposed without a password. Returns an error message or null. */
export function bindError(env: Record<string, string | undefined> = process.env): string | null {
  const host = (env.HOST ?? "").trim();
  const exposed = (host && !["127.0.0.1", "localhost", "::1", "[::1]"].includes(host) && !/^127\./.test(host)) || !!env.ALLOWED_HOSTS?.trim();
  if (!exposed || env.APP_PASSWORD || env.ALLOW_INSECURE_BIND === "1") return null;
  return "ERROR: the server is configured to accept connections from outside this computer (HOST other than 127.0.0.1, or ALLOWED_HOSTS set), but APP_PASSWORD is empty. Set APP_PASSWORD to a strong password (see 'Hosting' in the README) or use HOST=127.0.0.1.";
}
