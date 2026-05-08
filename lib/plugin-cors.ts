// Helpers CORS pour les endpoints `/api/plugin/*` consommes par
// l'extension navigateur depuis `chrome-extension://<id>` (origin
// distincte du domaine vault).
//
// L'env var `PLUGIN_ALLOWED_ORIGIN` definit l'origin autorise. Format
// attendu : `chrome-extension://abcdefghijklmnopqrstuvwxyz123456`.
// Plusieurs origins separes par virgule autorises (ex. dev + prod IDs).
//
// Si la variable n'est PAS definie, les endpoints plugin renvoient 403
// (kill switch — refus de fonctionner sans whitelist explicite).
//
// ─── Note sur le comportement Chrome ─────────────────────────────────────
// Chrome ne fait PAS toujours suivre l'header `Origin` pour les fetch
// d'extension vers une URL listee dans `host_permissions` :
//   - Requete "non-simple" (POST avec Content-Type: application/json) →
//     preflight CORS → Origin envoye → on peut le valider.
//   - Requete "simple" (GET avec uniquement Authorization) → pas de
//     preflight, Chrome strippe Origin → req.headers.get("origin") = null.
//
// Strategie : si Origin est present il DOIT matcher la whitelist
// (anti-CSRF depuis une page web tierce). S'il est absent, on fait
// confiance au Bearer token (verifie plus loin dans le handler) — c'est
// l'auth reelle de toute facon. Une page web malveillante NE PEUT PAS
// stripper Origin (le navigateur l'ajoute toujours pour les XHR/fetch
// cross-origin), donc le risque CSRF reste couvert.

import { NextResponse } from "next/server";

export type CorsResult =
  | { ok: true; allowOrigin: string | null }
  | { ok: false; reason: "no_origin_configured" | "origin_not_allowed" };

function parseAllowed(): string[] | null {
  const raw = process.env.PLUGIN_ALLOWED_ORIGIN;
  if (!raw) return null;
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

/**
 * Verifie que la requete provient d'une origin whitelistee. Retourne :
 *   - { ok: true, allowOrigin: <origin> } si Origin present et whitelistee
 *   - { ok: true, allowOrigin: null } si Origin absent (Chrome
 *     extension fetch sur URL host_permitted — voir note en tete de fichier)
 *   - { ok: false, reason } si Origin present mais pas whitelistee, ou si
 *     la whitelist n'est pas configuree (kill switch)
 */
export function checkPluginOrigin(req: Request): CorsResult {
  const allowed = parseAllowed();
  if (!allowed || allowed.length === 0) {
    return { ok: false, reason: "no_origin_configured" };
  }
  const origin = req.headers.get("origin");
  // Pas d'Origin → fetch d'extension avec host_permissions, on fait
  // confiance au Bearer token (verifie en aval dans le handler).
  if (!origin) {
    return { ok: true, allowOrigin: null };
  }
  if (!allowed.includes(origin)) {
    return { ok: false, reason: "origin_not_allowed" };
  }
  return { ok: true, allowOrigin: origin };
}

/**
 * Headers CORS a ajouter sur chaque reponse plugin (succes ou erreur).
 * Si `allowOrigin` est null, on ne pose pas `Access-Control-Allow-Origin`
 * (le client est cense ignorer CORS — extension fetch sans Origin).
 * `Vary: Origin` important pour les caches.
 */
export function corsHeaders(
  allowOrigin: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
  if (allowOrigin) {
    headers["Access-Control-Allow-Origin"] = allowOrigin;
  }
  return headers;
}

/**
 * Reponse OPTIONS preflight. Tous les endpoints plugin doivent l'exporter.
 *
 * Note : un preflight legitime du navigateur a TOUJOURS un Origin (sinon
 * il n'y a pas de notion de cross-origin a valider). Si Origin est absent
 * en preflight, c'est un client manuel (curl) — on renvoie 204 sans header.
 */
export function preflightResponse(req: Request): NextResponse {
  const cors = checkPluginOrigin(req);
  if (!cors.ok) {
    return new NextResponse(null, { status: 204 });
  }
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(cors.allowOrigin),
  });
}

/**
 * Wrapper : ajoute les headers CORS a une NextResponse existante.
 * Pratique pour les renvois 200/4xx/5xx. Si allowOrigin est null,
 * aucun header n'est ajoute (le client n'utilise pas CORS).
 */
export function withCors(
  res: NextResponse,
  allowOrigin: string | null,
): NextResponse {
  if (!allowOrigin) return res;
  for (const [k, v] of Object.entries(corsHeaders(allowOrigin))) {
    res.headers.set(k, v);
  }
  return res;
}
