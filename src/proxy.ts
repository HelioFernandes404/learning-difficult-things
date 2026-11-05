import { NextResponse, type NextRequest } from "next/server";
import { localeFromRequest, messages } from "@/i18n";
import { COOKIE, verifyToken } from "@/lib/auth";
import { allowedHosts, authEnabled, checkApiRequest, hostnameOf } from "@/lib/security";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const t = messages(localeFromRequest(req)).api;
  const isApi = pathname.startsWith("/api/");

  if (isApi) {
    const bad = checkApiRequest(req);
    if (bad) return bad;
  } else {
    const host = req.headers.get("host");
    if (!host || !allowedHosts().has(hostnameOf(host))) return new NextResponse(t.hostNotAllowed, { status: 403 });
  }

  if (authEnabled()) {
    const open = pathname === "/login" || pathname.startsWith("/api/auth/");
    if (!open && !verifyToken(req.cookies.get(COOKIE)?.value)) {
      if (isApi) return Response.json({ error: t.notAuthenticated }, { status: 401 });
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
