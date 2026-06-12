// #5 — Invalidation des sessions JWT (cf. security.md §3.14.3).
//
// Les sessions sont des JWT stateless (8h). Pour couper une session avant son
// expiration naturelle (reset password, désactivation 2FA), on stampe le token
// avec son instant d'émission (`loginAt`, ms epoch) et l'utilisateur porte une
// borne `sessionsValidFrom` : tout token émis AVANT cette borne est périmé.

/**
 * Vrai si le JWT (émis à `loginAt`) doit être rejeté car antérieur à la borne
 * `sessionsValidFrom` de l'utilisateur.
 *
 * - `loginAt` null/undefined = token legacy (émis avant l'introduction du
 *   champ) → jamais invalidé par ce mécanisme (expire naturellement sous 8h).
 * - `sessionsValidFrom` null/undefined = l'utilisateur n'a jamais invalidé ses
 *   sessions → rien à couper.
 * - Comparaison stricte (`>`) : un token émis EXACTEMENT à la borne (ex. la
 *   session courante lors d'un 2FA disable, où sessionsValidFrom = son loginAt)
 *   reste valide.
 */
export function isSessionInvalidated(
  loginAt: number | null | undefined,
  sessionsValidFrom: Date | null | undefined,
): boolean {
  if (loginAt == null || !sessionsValidFrom) return false;
  return sessionsValidFrom.getTime() > loginAt;
}
