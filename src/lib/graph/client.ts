import { LOCALE_COOKIE, fromAcceptLanguage, isLocale, parseCookie } from "@/i18n";
import { practiceRequest } from "@/lib/lesson-request";

/** Browser helpers: create a session from the graph and open it on the home page. */
export type StartOpts = { title: string; domain?: string; mode?: "practice"; plan?: string[]; goal?: string };

export async function startSessionFromGraph(o: StartOpts) {
  const cookie = parseCookie(document.cookie, LOCALE_COOKIE);
  const locale = isLocale(cookie) ? cookie : fromAcceptLanguage(navigator.language);
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      request: o.mode === "practice" ? practiceRequest(o.title, locale) : o.title,
      context: o.domain || undefined,
      goal: o.goal,
      mode: o.mode,
      plan: o.plan && o.plan.length > 1 ? o.plan.join(" > ") : undefined,
    }),
  });
  const s = (await res.json()) as { id: string };
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- reloads home with ?session=
  window.location.href = `/?session=${s.id}`;
}
