import { getT } from "@/i18n/server";
import { COOKIE, MAX_AGE, makeToken, passwordOk, rateLimited } from "@/lib/auth";
import { authEnabled } from "@/lib/security";

export async function POST(req: Request) {
  const { t } = await getT();
  if (!authEnabled()) return Response.json({ error: t.api.auth.notConfigured }, { status: 404 });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (rateLimited(ip)) return Response.json({ error: t.api.auth.tooManyAttempts }, { status: 429 });
  const b = (await req.json().catch(() => null)) as { password?: unknown } | null;
  if (typeof b?.password !== "string" || !passwordOk(b.password)) return Response.json({ error: t.api.auth.wrongPassword }, { status: 401 });
  const secure = (req.headers.get("x-forwarded-proto") ?? "").split(",")[0].trim() === "https" || new URL(req.url).protocol === "https:";
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", `${COOKIE}=${makeToken()}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`);
  return res;
}
