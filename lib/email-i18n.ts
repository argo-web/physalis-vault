/**
 * Minimal i18n helper for email templates.
 *
 * Deliberately does NOT use next-intl's getTranslations() because emails
 * are sent from API routes, webhooks (Stripe) and cron jobs — contexts
 * that may not have a Next.js request. This reads the same messages/*.json
 * files to stay in sync but works in any Node.js environment.
 */

// Importing the JSON files directly gives us type-checked, build-time
// bundled translations. next.config.ts already sets resolveJsonModule = true.
import enMessages from "../messages/en.json";
import frMessages from "../messages/fr.json";
import esMessages from "../messages/es.json";

export type EmailLocale = "en" | "fr" | "es";

const MESSAGES: Record<EmailLocale, typeof enMessages> = {
  en: enMessages,
  fr: frMessages,
  es: esMessages,
};

function getPath(obj: unknown, path: string): string {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (typeof cur !== "object" || cur === null) return path;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : path;
}

/**
 * Returns a t() function scoped to the `emails.*` namespace for the given locale.
 * Falls back to "en" for unknown locales.
 *
 * Usage:
 *   const t = emailTranslator(locale);
 *   t("invitation.subject", { org: "Acme" })  // → translated subject
 */
export function emailTranslator(locale?: string | null) {
  const loc: EmailLocale =
    locale && locale in MESSAGES ? (locale as EmailLocale) : "en";
  const msgs = MESSAGES[loc].emails as Record<string, unknown>;

  return function t(key: string, vars?: Record<string, string>): string {
    let str = getPath(msgs, key);
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replaceAll(`{${k}}`, v);
      }
    }
    return str;
  };
}

/**
 * Extracts the locale from a Next.js Request URL or x-next-intl-locale header.
 * Use this in API routes to get the acting user's locale.
 *
 *   const locale = localeFromRequest(req);
 */
export function localeFromRequest(req: Request): EmailLocale {
  const header = req.headers.get("x-next-intl-locale");
  if (header && header in MESSAGES) return header as EmailLocale;

  const match = new URL(req.url).pathname.match(/^\/([a-z]{2})(\/|$)/);
  if (match && match[1] in MESSAGES) return match[1] as EmailLocale;

  return "en";
}

/**
 * Formats a date for display in email templates using the locale's conventions.
 */
export function formatEmailDate(date: Date, locale: EmailLocale): string {
  const localeMap: Record<EmailLocale, string> = {
    en: "en-GB",
    fr: "fr-FR",
    es: "es-ES",
  };
  return date.toLocaleString(localeMap[locale], {
    timeZone: "Europe/Paris",
    dateStyle: "long",
    timeStyle: "short",
  });
}
