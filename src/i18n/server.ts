import { cookies, headers } from "next/headers";
import { fromAcceptLanguage, isLocale, LOCALE_COOKIE, messages, type Locale, type Messages } from "./index";

/** Locale of the current request (Server Components and Route Handlers): cookie, else Accept-Language. */
export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  return fromAcceptLanguage((await headers()).get("accept-language"));
}

/** Messages for the current request. */
export async function getT(): Promise<{ t: Messages; locale: Locale }> {
  const locale = await getLocale();
  return { t: messages(locale), locale };
}
