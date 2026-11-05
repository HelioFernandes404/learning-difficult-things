"use client";

import { useLocale, useSetLocale, useT } from "@/i18n/client";
import { LOCALES, LOCALE_LABELS, isLocale } from "@/i18n";

/** Small native <select>; works on /, /login, /settings. */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const setLocale = useSetLocale();
  const t = useT();
  return (
    <select
      aria-label={t.common.language}
      title={t.common.language}
      value={locale}
      onChange={(e) => isLocale(e.target.value) && setLocale(e.target.value)}
      className={`h-8 rounded-lg border bg-background px-2 text-xs text-foreground ${className}`}
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>{LOCALE_LABELS[l]}</option>
      ))}
    </select>
  );
}
