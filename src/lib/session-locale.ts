import { isLocale, type Locale } from "@/i18n";

/** Language of a session. Rows created before i18n have no locale and were Portuguese. */
export function sessionLocale(row: { locale?: string | null } | undefined): Locale {
  return isLocale(row?.locale) ? row.locale : "pt-BR";
}
