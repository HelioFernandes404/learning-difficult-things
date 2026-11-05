import { localeFromRequest, messages } from "@/i18n";

/** Origin/host checks (pure; used by the proxy and the routes). */

const LOOPBACK = ["localhost", "127.0.0.1", "::1"];

/** "Host: [::1]:3000" / "evil.com:80" / "https://x.com" -> lowercase hostname, without port. */
export function hostnameOf(value: string): string {
  let v = value.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/[/?#].*$/, "");
  v = v.replace(/^.*@/, "");
  if (v.startsWith("[")) return v.slice(1, v.indexOf("]") === -1 ? undefined : v.indexOf("]"));
  return v.replace(/:\d+$/, "");
}

export function allowedHosts(): Set<string> {
  const extra = (process.env.ALLOWED_HOSTS ?? "").split(",").map(hostnameOf).filter(Boolean);
  return new Set([...LOOPBACK, ...extra]);
}

export const isLoopbackHost = (h: string) => LOOPBACK.includes(hostnameOf(h)) || /^127\.\d+\.\d+\.\d+$/.test(hostnameOf(h));

export function authEnabled(): boolean {
  return !!process.env.APP_PASSWORD;
}

const json = (error: string, status: number) => Response.json({ error }, { status });

/** Returns an error Response if the /api request looks suspicious; null if ok. */
export function checkApiRequest(req: Request): Response | null {
  const t = messages(localeFromRequest(req)).api;
  const allow = allowedHosts();
  const host = req.headers.get("host");
  if (!host || !allow.has(hostnameOf(host))) return json(t.hostNotAllowed, 403);

  const origin = req.headers.get("origin");
  if (origin !== null && (origin === "null" || !allow.has(hostnameOf(origin)))) return json(t.originNotAllowed, 403);
  const site = req.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return json(t.crossSite, 403);

  const m = req.method.toUpperCase();
  if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
    const ct = (req.headers.get("content-type") ?? "").toLowerCase();
    const bodyless = m === "DELETE" && !ct && (req.headers.get("content-length") ?? "0") === "0";
    if (!bodyless && !ct.startsWith("application/json")) return json(t.contentTypeJson, 415);
  }
  return null;
}

/** Extra defense inside the routes that touch the key. */
export function requireJson(req: Request): Response | null {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  return ct.startsWith("application/json") ? null : json(messages(localeFromRequest(req)).api.contentTypeJson, 415);
}
