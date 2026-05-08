// GitHub Actions OIDC token verification.
//
// Le runner GitHub Actions peut, sur demande (`permissions: id-token: write`),
// produire un JWT signe par GitHub avec des claims sur le repo, le workflow
// et la branche. Le SecretVault valide ce JWT contre le JWKS public de
// GitHub et fait correspondre les claims a une `Policy` en DB.
//
// Hot path : `/api/deploy`. La verification crypto est faite par jose qui
// gere le cache JWKS en memoire (TTL configurable). Une instance `JWKSet`
// persistante au niveau du module suffit (re-instanciee uniquement au
// redemarrage du process).

import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from "jose";
import type { JWTPayload } from "jose";

const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_JWKS_URL = `${GITHUB_ISSUER}/.well-known/jwks`;

// Audience attendue dans les tokens. `OIDC_AUDIENCE` env var permet de
// l'override (recommandé : poser explicitement le hostname du portail vault,
// ex. `vault.physalis.cloud`, pour empêcher la replay d'un token destiné à
// un autre service). Defaut : portail générique post-rebrand Physalis.
function expectedAudience(): string {
  return process.env.OIDC_AUDIENCE ?? "vault.physalis.cloud";
}

// Singleton JWKS resolver. jose v6 cache les cles en memoire pour ~10 min
// (par defaut), avec rotation automatique a la rotation des cles GitHub.
// On accepte un override (`OIDC_JWKS_URL`) pour les tests qui montent un
// fake issuer local.
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksUrlUsed: string | null = null;

function getJwks() {
  const url = process.env.OIDC_JWKS_URL ?? GITHUB_JWKS_URL;
  if (!jwksCache || jwksUrlUsed !== url) {
    jwksCache = createRemoteJWKSet(new URL(url));
    jwksUrlUsed = url;
  }
  return jwksCache;
}

// Reset le cache JWKS — utile uniquement en test (mock issuer).
export function _resetJwksCache(): void {
  jwksCache = null;
  jwksUrlUsed = null;
}

export type GithubOidcClaims = {
  /** "owner/repo" */
  repository: string;
  /** "owner/repo/.github/workflows/<file>.yml@refs/heads/<branch>" */
  job_workflow_ref: string;
  /** "refs/heads/<branch>" or "refs/tags/<tag>" or "refs/pull/<n>/merge" */
  ref: string;
  ref_type?: string;
  sub?: string;
  actor?: string;
  workflow?: string;
  /** Permet d'extraire le branch sans parser `ref` quand dispo. */
  ref_name?: string;
};

export type ParsedClaims = {
  repository: string;
  /** Basename du workflow file, ex. "deploy.yml". */
  workflowFile: string;
  /** Nom de branche extrait de `ref` (sans le prefixe `refs/heads/`). */
  branch: string;
  raw: JWTPayload & GithubOidcClaims;
};

export type VerifyResult =
  | { ok: true; claims: ParsedClaims }
  | { ok: false; reason: VerifyError };

export type VerifyError =
  | "missing_token"
  | "expired"
  | "bad_signature"
  | "wrong_issuer"
  | "wrong_audience"
  | "missing_claims"
  | "unparseable_ref"
  | "jwks_unreachable";

/**
 * Valide un token OIDC GitHub Actions.
 *
 * Verifications successives :
 *   1. Signature contre le JWKS GitHub (fetch + cache jose)
 *   2. `iss` strict = `https://token.actions.githubusercontent.com`
 *   3. `aud` strict = `OIDC_AUDIENCE` (ou default `secretvault.argoweb.fr`)
 *   4. `exp` non depasse (delta de tolerance 10s)
 *   5. Claims requis presents : `repository`, `job_workflow_ref`, `ref`
 *   6. Extraction du `workflowFile` et du `branch` parsables
 *
 * Aucune verification d'autorisation ici — c'est le job du caller (lookup
 * Policy en DB).
 */
export async function verifyGithubOidcToken(
  rawToken: string | null | undefined,
): Promise<VerifyResult> {
  if (!rawToken || typeof rawToken !== "string") {
    return { ok: false, reason: "missing_token" };
  }

  const audience = expectedAudience();

  let payload: JWTPayload & Partial<GithubOidcClaims>;
  try {
    const verified = await jwtVerify(rawToken, getJwks(), {
      issuer: GITHUB_ISSUER,
      audience,
      clockTolerance: 10,
    });
    payload = verified.payload as JWTPayload & Partial<GithubOidcClaims>;
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      return { ok: false, reason: "expired" };
    }
    if (err instanceof joseErrors.JWTClaimValidationFailed) {
      // jose differencie iss/aud via `claim` ; on remappe.
      const claim = (err as { claim?: string }).claim;
      if (claim === "iss") return { ok: false, reason: "wrong_issuer" };
      if (claim === "aud") return { ok: false, reason: "wrong_audience" };
      return { ok: false, reason: "missing_claims" };
    }
    if (err instanceof joseErrors.JWSInvalid || err instanceof joseErrors.JWSSignatureVerificationFailed) {
      return { ok: false, reason: "bad_signature" };
    }
    if (err instanceof joseErrors.JWKSNoMatchingKey) {
      return { ok: false, reason: "bad_signature" };
    }
    if (
      err instanceof joseErrors.JOSEError &&
      typeof err.message === "string" &&
      err.message.toLowerCase().includes("jwks")
    ) {
      return { ok: false, reason: "jwks_unreachable" };
    }
    return { ok: false, reason: "bad_signature" };
  }

  const repo = typeof payload.repository === "string" ? payload.repository : "";
  const ref = typeof payload.ref === "string" ? payload.ref : "";
  const wfRef =
    typeof payload.job_workflow_ref === "string" ? payload.job_workflow_ref : "";
  if (!repo || !ref || !wfRef) {
    return { ok: false, reason: "missing_claims" };
  }

  // Branch : ref = "refs/heads/<branch>" ou "refs/tags/<tag>". On accepte
  // aussi `ref_name` directement.
  let branch: string | null = null;
  if (typeof payload.ref_name === "string" && payload.ref_name.length > 0) {
    branch = payload.ref_name;
  } else if (ref.startsWith("refs/heads/")) {
    branch = ref.slice("refs/heads/".length);
  } else if (ref.startsWith("refs/tags/")) {
    branch = ref.slice("refs/tags/".length);
  }
  if (!branch) {
    return { ok: false, reason: "unparseable_ref" };
  }

  // Workflow file : extrait de "owner/repo/.github/workflows/<file>@<ref>"
  // On veut juste le basename "deploy.yml".
  const wfMatch = wfRef.match(/\.github\/workflows\/([^@]+)/);
  if (!wfMatch || !wfMatch[1]) {
    return { ok: false, reason: "missing_claims" };
  }
  const workflowFile = wfMatch[1];

  return {
    ok: true,
    claims: {
      repository: repo,
      workflowFile,
      branch,
      raw: payload as JWTPayload & GithubOidcClaims,
    },
  };
}

/**
 * Extrait le token Bearer de l'header Authorization. Retourne null si
 * absent ou format invalide.
 */
export function extractBearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!h || typeof h !== "string") return null;
  const m = h.match(/^Bearer\s+(.+)$/);
  return m && m[1] ? m[1].trim() : null;
}
