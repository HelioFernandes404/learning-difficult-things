import { en, type Messages } from "./en";
import { ptBR } from "./pt-BR";

export const LOCALES = ["en", "pt-BR"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "ldt_locale";
/** Native names, shown in the language switcher. */
export const LOCALE_LABELS: Record<Locale, string> = { en: "English", "pt-BR": "Português (Brasil)" };
/** English names, used in LLM prompts ("Always write to the student in {language}"). */
export const LANGUAGE_NAMES: Record<Locale, string> = { en: "English", "pt-BR": "Brazilian Portuguese" };

export type { Messages };
const DICTS: Record<Locale, Messages> = { en, "pt-BR": ptBR };

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);
export const messages = (locale: Locale): Messages => DICTS[locale];

/** Accept-Language starting with pt -> pt-BR, anything else -> en. */
export function fromAcceptLanguage(header: string | null | undefined): Locale {
  const first = (header ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("pt") ? "pt-BR" : "en";
}

export function parseCookie(header: string | null | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

/** Pure resolver for any Request (route handlers, proxy): cookie first, then Accept-Language. */
export function localeFromRequest(req: Request): Locale {
  const c = parseCookie(req.headers.get("cookie"), LOCALE_COOKIE);
  return isLocale(c) ? c : fromAcceptLanguage(req.headers.get("accept-language"));
}

/** Replace {name} placeholders. */
export const fmt = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
