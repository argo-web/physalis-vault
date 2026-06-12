import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "es", "fr"],
  defaultLocale: "fr",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
