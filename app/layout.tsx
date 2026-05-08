import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Physalis",
  description: "Self-hosted secrets manager",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Lecture du header x-nonce pose par le middleware. Cet appel a un effet
  // de bord critique : il bascule TOUTES les pages en rendu dynamique au
  // lieu de prerender statique. Sans ca, les pages comme /login seraient
  // servies depuis le build cache (sans nonce dans les <script> inline) +
  // CSP fraiche (avec nonce different) → mismatch + browser block.
  // Cf. https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
  await headers();
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
