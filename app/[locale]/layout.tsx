import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import "../globals.css";

export const metadata: Metadata = {
  title: "Physalis",
  description: "Self-hosted secrets manager",
};

// Sans cet export, mobile zoome-out a 980px par defaut et l'app n'est
// pas du tout responsive. Next 15 separe viewport de metadata.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Lecture du header x-nonce pose par le middleware. Cet appel a un effet
  // de bord critique : il bascule TOUTES les pages en rendu dynamique au
  // lieu de prerender statique. Sans ca, les pages comme /login seraient
  // servies depuis le build cache (sans nonce dans les <script> inline) +
  // CSP fraiche (avec nonce different) → mismatch + browser block.
  await headers();

  const messages = await getMessages();

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
