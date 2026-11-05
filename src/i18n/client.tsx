"use client";

import { createContext, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, messages, type Locale, type Messages } from "./index";

const Ctx = createContext<Locale>("en");

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export const useLocale = (): Locale => useContext(Ctx);

/** Typed messages for the active locale: `const t = useT(); t.chat.send`. */
export function useT(): Messages {
  const locale = useLocale();
  return useMemo(() => messages(locale), [locale]);
}

/** Returns a function that stores the locale in the cookie and refreshes server components. */
export function useSetLocale() {
  const router = useRouter();
  return (locale: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
}
