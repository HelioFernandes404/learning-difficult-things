import { LOCALES, messages, type Locale } from "@/i18n";
import { LEGACY_LEARN_PREFIX, LEGACY_PRACTICE_PREFIX } from "./legacy-pt";

/** Stable level keys stored in sessions.level. */
export const LEVEL_KEYS = ["never_seen", "heard_of", "use_shallow", "go_deeper"] as const;
export type LevelKey = (typeof LEVEL_KEYS)[number];

export type LessonRequest = { request?: string | null; context?: string | null; goal?: string | null; level?: string | null };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const prefixRe = (get: (l: Locale) => string) => new RegExp("^(?:" + LOCALES.map((l) => escapeRe(get(l).replace(/:$/, ""))).join("|") + "):?\\s*", "i");
const LEARN_RE = prefixRe((l) => messages(l).lesson.iWantToLearn);
const PRACTICE_RE = prefixRe((l) => messages(l).lesson.practicePrefix);

/** Short title: first line, up to ~60 chars. */
export function shortTitle(text: string) {
  const line = text.trim().split("\n")[0].trim();
  return line.length > 60 ? line.slice(0, 59).trimEnd() + "…" : line;
}

/** "Practice: <title>" in the given locale. */
export function practiceRequest(title: string, locale: Locale) {
  return `${messages(locale).lesson.practicePrefix} ${title}`;
}

/** True if the text is a practice request in any locale (or the legacy format). */
export function isPracticeRequest(text: string) {
  const s = text.trim();
  return PRACTICE_RE.test(s) || LEGACY_PRACTICE_PREFIX.test(s);
}

/** The student's first message, composed from the filled fields. */
export function composeFirstMessage(r: LessonRequest, locale: Locale) {
  const m = messages(locale).lesson;
  const req = (r.request ?? "").trim().replace(LEARN_RE, "").replace(LEGACY_LEARN_PREFIX, "");
  const raw = (r.request ?? "").trim();
  const lines = [isPracticeRequest(raw) ? raw : `${m.iWantToLearn} ${req}`];
  if (r.context?.trim()) lines.push(`${m.contextPrefix} ${r.context.trim()}`);
  if (r.goal?.trim()) lines.push(`${m.goalPrefix} ${r.goal.trim()}`);
  const level = r.level?.trim();
  if (level) {
    const label = (LEVEL_KEYS as readonly string[]).includes(level) ? m.levels[level as LevelKey] : level;
    lines.push(`${m.levelPrefix} ${label}`);
  }
  return lines.join("\n");
}
