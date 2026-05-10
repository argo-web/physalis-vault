// Estimation heuristique de la force d'un mot de passe (pas de dep
// externe — zxcvbn pèse 400KB et l'on cible une UX coffre perso simple).
//
// Renvoie un score 0-4 (à la zxcvbn) et un label/color FR :
//   0 = très faible   (rouge)     — vide ou ≤ 4 chars
//   1 = faible        (orange)    — 5-7 chars OU une seule classe
//   2 = moyen         (jaune)     — 8-11 chars + 2 classes
//   3 = fort          (vert clair) — 12-15 chars + 3 classes
//   4 = très fort     (vert)      — ≥ 16 chars + 3+ classes ET pas de motif
//
// Détecte aussi quelques motifs faibles courants : suite numérique
// (1234), répétitions (aaaa), mots clavier (qwerty/azerty), mots
// communs (password, motdepasse, admin, etc.) → décote d'un cran.

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export type Strength = {
  score: StrengthLevel;
  label: string;
  color: string;
  hint: string | null;
};

const COMMON_PATTERNS = [
  /(.)\1{3,}/i,                          // 4+ chars répétés (aaaa, 1111)
  /0123|1234|2345|3456|4567|5678|6789|7890/,
  /abcd|bcde|cdef|defg/i,
  /qwer|wert|erty|asdf|sdfg|zxcv/i,      // QWERTY
  /azer|zerty|qsdf|wxcv/i,                // AZERTY
  /password|motdepasse|admin|welcome|letmein|iloveyou/i,
];

function classCount(pwd: string): number {
  let n = 0;
  if (/[a-z]/.test(pwd)) n++;
  if (/[A-Z]/.test(pwd)) n++;
  if (/[0-9]/.test(pwd)) n++;
  if (/[^a-zA-Z0-9]/.test(pwd)) n++;
  return n;
}

function hasCommonPattern(pwd: string): boolean {
  for (const re of COMMON_PATTERNS) {
    if (re.test(pwd)) return true;
  }
  return false;
}

const LABELS: Record<StrengthLevel, { label: string; color: string }> = {
  0: { label: "très faible", color: "#ef4444" },   // rouge
  1: { label: "faible",      color: "#f97316" },   // orange
  2: { label: "moyen",       color: "#eab308" },   // jaune
  3: { label: "fort",        color: "#84cc16" },   // vert clair
  4: { label: "très fort",   color: "#16a34a" },   // vert
};

export function estimateStrength(pwd: string): Strength {
  if (!pwd) {
    return { score: 0, label: LABELS[0].label, color: LABELS[0].color, hint: null };
  }

  const len = pwd.length;
  const classes = classCount(pwd);
  const weak = hasCommonPattern(pwd);

  let score: StrengthLevel;
  if (len <= 4) score = 0;
  else if (len <= 7 || classes <= 1) score = 1;
  else if (len <= 11 && classes >= 2) score = 2;
  else if (len <= 15 && classes >= 3) score = 3;
  else if (classes >= 3) score = 4;
  else score = 2;

  // Décote si motif faible détecté (sauf pour score 0 déjà au plancher).
  if (weak && score > 0) {
    score = (score - 1) as StrengthLevel;
  }

  let hint: string | null = null;
  if (score < 3) {
    if (len < 12) hint = "Ajoute des caractères (12+ recommandés).";
    else if (classes < 3) hint = "Mélange majuscules, chiffres et symboles.";
    else if (weak) hint = "Évite les motifs courants (1234, aaaa, qwerty).";
  }

  return {
    score,
    label: LABELS[score].label,
    color: LABELS[score].color,
    hint,
  };
}
