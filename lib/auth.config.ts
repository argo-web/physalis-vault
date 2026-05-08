// Config NextAuth Edge-compatible. Pas d'imports lourds (bcrypt, otplib,
// node:crypto…) — uniquement ce dont a besoin le middleware pour valider la
// session JWT et router. Le provider Credentials (auth complet) vit dans
// lib/auth.ts qui importe ce fichier.

import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

// 8h : couvre une journee de travail typique. Apres ce delai, le JWT
// expire cote serveur et `auth()` rejette la session — l'user est
// redirige vers /login meme si le cookie est encore present (ce qui
// arrive quand le navigateur est reste ouvert ou apres un reboot a
// moins de 8h). Auth.js v5 ne permet pas de cookie strictement
// "session-only" via la config publique (l'expires est forcement
// pose sur la base de session.maxAge), mais avec 8h on couvre
// largement le cas "je me reconnecte le matin".
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export const authConfig = {
  secret,
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: string }).role;
        token.tenantSlug =
          (user as { tenantSlug?: string | null }).tenantSlug ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.tenantSlug =
          (token.tenantSlug as string | null | undefined) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
