// Middleware Next.js — fait deux choses pour chaque requete HTML :
//   1. Genere un nonce et pose un Content-Security-Policy strict (script-src
//      avec nonce + strict-dynamic). Next.js v13+ lit le header `x-nonce`
//      (et `Content-Security-Policy`) sur la requete et l'applique
//      automatiquement aux <script> qu'il inline pour l'hydration.
//   2. Pour les routes protegees, valide la session JWT et redirige vers
//      /login si manquante (logique existante, conservee).
//
// CSP rationale :
//   - script-src 'self' 'nonce-<x>' 'strict-dynamic' : interdit tout script
//     inline non-nonce ; le nonce permet aux scripts de Next d'en charger
//     d'autres dynamiquement (chunks). Pas d'allowlist statique a maintenir.
//   - style-src 'self' 'unsafe-inline' : compromis pragmatique car React
//     inline les style="..." attributes (ex. style={{ color: ... }}). Les
//     attributs HTML ne supportent pas les nonces, et les CSS injections
//     sont nettement moins critiques que les scripts.
//   - img-src 'self' data: blob: : data: pour le QR code 2FA (base64).
//   - frame-ancestors 'none' + form-action 'self' + base-uri 'self' :
//     defense en profondeur classique anti-clickjacking et anti-takeover.
//   - upgrade-insecure-requests : downgrade auto HTTP→HTTPS si jamais une
//     ressource passe avec un schema relatif.
//   - 'unsafe-eval' uniquement en dev : Next HMR l'exige. En prod : strict.

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/projects",
  "/orgs",
  "/settings",
  "/shares",
  "/vault",
  "/admin",
];

function isProtectedPath(path: string): boolean {
  return PROTECTED_PREFIXES.some(
    (p) => path === p || path.startsWith(p + "/"),
  );
}

function buildCsp(nonce: string): string {
  const dev = process.env.NODE_ENV !== "production";
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(dev ? ["'unsafe-eval'"] : []),
  ].join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export default auth((req) => {
  const path = req.nextUrl.pathname;

  // Generation du nonce (16 bytes hex via Web Crypto, dispo en Edge runtime).
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = Array.from(nonceBytes, (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const csp = buildCsp(nonce);

  // 1. Auth check : redirige vers /login si route protegee + pas authentifie.
  if (isProtectedPath(path) && !req.auth) {
    const url = new URL("/login", req.url);
    url.searchParams.set("callbackUrl", path);
    const response = NextResponse.redirect(url);
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  // 2. Pose le nonce + CSP dans les headers de la requete pour que Next les
  //    lise pour l'hydration. Pose aussi la CSP sur la response pour que le
  //    navigateur l'applique. Les deux doivent etre coherents.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);
  return response;
});

// Matcher : toutes les routes HTML. On exclut :
//   - /api : pas de HTML
//   - /_next/static, /_next/image, favicon.ico : assets statiques
//   - les fichiers avec extension image
//   - les requetes de prefetch RSC (sinon le prefetch genere un nonce qui
//     ne correspondra pas a celui de la navigation reelle)
export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|zip)).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
