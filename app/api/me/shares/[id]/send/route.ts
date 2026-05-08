// POST /api/me/shares/[id]/send — envoie l'URL d'un share par email au destinataire.
//
// Architecture : le client envoie l'URL COMPLETE (token + #fragment cle).
// Le serveur la transmet a Mailgun puis l'oublie immediatement (pas de
// persistance). C'est une exception consciente au zero-knowledge :
// Mailgun voit l'URL, donc la cle. Acceptable comme tradeoff (l'user
// choisit explicitement d'envoyer par email).
//
// Validations :
//   - L'user doit posseder le share
//   - Le share doit etre encore actif (pas consomme/expire/revoque)
//   - Email format minimal
//
// Audit `SHARE_SEND_EMAIL` avec metadata.recipientEmail pour traceabilite.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson, requireUser } from "@/lib/api";
import { logAction } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Body = {
  email?: string;
  url?: string;
};

export async function POST(req: Request, { params }: Params) {
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;
  const { user } = userRes;
  const { id } = await params;

  const limited = rateLimit(
    req,
    "share-send-email",
    { max: 10, windowMs: 60_000 },
    user.id,
  );
  if (limited) return limited;

  const body = (await readJson(req)) as Body | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof body.email !== "string" || !EMAIL_RE.test(body.email.trim())) {
    return NextResponse.json(
      { error: "valid email required" },
      { status: 400 },
    );
  }
  if (
    typeof body.url !== "string" ||
    !body.url.startsWith("http") ||
    body.url.length > 2048
  ) {
    return NextResponse.json({ error: "valid url required" }, { status: 400 });
  }

  const share = await prisma.oneTimeShare.findFirst({
    where: { id, createdById: user.id },
  });
  if (!share) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (share.consumedAt || share.revokedAt || share.expiresAt <= new Date()) {
    return NextResponse.json(
      { error: "Share is no longer active" },
      { status: 400 },
    );
  }

  const recipient = body.email.trim().toLowerCase();
  const expires = share.expiresAt.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
  });
  const label = share.title?.trim() || "Sans titre";
  const hasPassword = share.passwordHash !== null;

  const text = [
    `Bonjour,`,
    ``,
    `${user.email} t'a partagé un secret via Physalis : "${label}".`,
    ``,
    `Ouvre ce lien à usage unique avant ${expires} :`,
    body.url,
    ``,
    hasPassword
      ? `Un mot de passe te sera demandé. ${user.email} te l'a (ou va te le) communiquer via un autre canal.`
      : `Le lien sera détruit automatiquement après ouverture.`,
    ``,
    `Si tu n'attendais pas ce partage, ignore ce message.`,
  ].join("\n");

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a2e">
      <h2 style="margin:0 0 16px;font-size:20px">Un secret t'a été partagé</h2>
      <p style="margin:0 0 12px">
        <strong>${user.email}</strong> t'a partagé "<strong>${label}</strong>" via Physalis.
      </p>
      <p style="margin:0 0 16px">Ouvre ce lien à usage unique avant <strong>${expires}</strong> :</p>
      <a href="${body.url}"
         style="display:inline-block;margin:0 0 16px;padding:12px 24px;background:#1a1f35;color:#fff;border-radius:8px;text-decoration:none;font-weight:500;word-break:break-all">
        Voir le secret
      </a>
      ${
        hasPassword
          ? `<p style="margin:16px 0 0;font-size:13px;color:#4a5568">Un mot de passe te sera demandé — il t'a été (ou va t'être) communiqué par un autre canal.</p>`
          : `<p style="margin:16px 0 0;font-size:13px;color:#4a5568">Le lien sera détruit automatiquement après ouverture.</p>`
      }
      <p style="margin:16px 0 0;font-size:12px;color:#718096">Si tu n'attendais pas ce partage, ignore ce message.</p>
    </div>
  `;

  try {
    await sendEmail({
      to: recipient,
      subject: `${user.email} t'a partagé "${label}" sur Physalis`,
      text,
      html,
    });
  } catch (err) {
    console.error("[share] failed to send email:", err);
    return NextResponse.json(
      { error: "Email transport failed" },
      { status: 502 },
    );
  }

  logAction({
    action: "SHARE_SEND_EMAIL",
    actor: { kind: "user", userId: user.id, email: user.email },
    organizationId: share.organizationId,
    targetType: "OneTimeShare",
    targetId: share.id,
    metadata: { recipientEmail: recipient, hasPassword },
    req,
  });

  return NextResponse.json({ ok: true });
}
