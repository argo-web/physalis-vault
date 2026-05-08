/**
 * Email delivery.
 *
 * Provider selection (first match wins):
 *   - EMAIL_MAILGUN_API_KEY + EMAIL_MAILGUN_DOMAIN + EMAIL_MAILGUN_HOST → Mailgun API
 *   - RESEND_API_KEY                                                    → Resend
 *   - SMTP_URL                                                          → SMTP
 *   - (none)                                                            → stdout stub
 *
 * The rest of the app calls `sendEmail()` and `sendInvitationEmail()`
 * without knowing the provider.
 *
 * NEVER log secrets, only invitation links.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type Transport = {
  send: (msg: EmailMessage) => Promise<void>;
};

// ── Mailgun ────────────────────────────────────────────────────────────────

async function mailgunTransport(): Promise<Transport> {
  const { default: Mailgun } = await import("mailgun.js");
  const { default: FormData } = await import("form-data");

  const mg = new Mailgun(FormData).client({
    username: "api",
    key: process.env.EMAIL_MAILGUN_API_KEY!,
    url: `https://${process.env.EMAIL_MAILGUN_HOST ?? "api.mailgun.net"}`,
  });

  const domain = process.env.EMAIL_MAILGUN_DOMAIN!;
  const from =
    process.env.EMAIL_FROM ?? `Physalis <noreply@${domain}>`;

  return {
    async send(msg) {
      await mg.messages.create(domain, {
        from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
      });
    },
  };
}

// ── Stdout stub (dev) ──────────────────────────────────────────────────────

function consoleTransport(): Transport {
  return {
    async send(msg) {
      console.log(
        `[email:stub] to=${msg.to} subject="${msg.subject}"\n${msg.text}`,
      );
    },
  };
}

// ── Provider selection ─────────────────────────────────────────────────────

// Cache l'instance pour eviter de re-importer mailgun.js et reconstruire le
// client a chaque envoi. Le module est charge une fois pour la duree du
// process Node.
let cachedTransport: Transport | undefined;

async function transport(): Promise<Transport> {
  if (cachedTransport) return cachedTransport;
  if (process.env.EMAIL_MAILGUN_API_KEY && process.env.EMAIL_MAILGUN_DOMAIN) {
    cachedTransport = await mailgunTransport();
  } else {
    // Brancher d'autres providers ici si besoin :
    // if (process.env.RESEND_API_KEY) cachedTransport = await resendTransport();
    // if (process.env.SMTP_URL)       cachedTransport = await smtpTransport();
    cachedTransport = consoleTransport();
  }
  return cachedTransport;
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const t = await transport();
  await t.send(msg);
}

export type InvitationEmailParams = {
  to: string;
  inviterEmail: string;
  organizationName: string;
  acceptUrl: string;
  expiresAt: Date;
};

export async function sendInvitationEmail(
  params: InvitationEmailParams,
): Promise<void> {
  const expires = params.expiresAt.toISOString().split("T")[0];

  const text = [
    `Bonjour,`,
    ``,
    `${params.inviterEmail} vous invite à rejoindre l'organisation "${params.organizationName}" sur Physalis.`,
    ``,
    `Accepter l'invitation :`,
    params.acceptUrl,
    ``,
    `Ce lien expire le ${expires}.`,
    ``,
    `Si vous n'attendiez pas cette invitation, ignorez ce message.`,
  ].join("\n");

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a2e">
      <h2 style="margin:0 0 16px;font-size:20px">Invitation à rejoindre ${params.organizationName}</h2>
      <p style="margin:0 0 12px">
        <strong>${params.inviterEmail}</strong> vous invite à rejoindre l'organisation
        <strong>${params.organizationName}</strong> sur Physalis.
      </p>
      <a href="${params.acceptUrl}"
         style="display:inline-block;margin:16px 0;padding:12px 24px;background:#1a1f35;color:#fff;border-radius:8px;text-decoration:none;font-weight:500">
        Accepter l'invitation
      </a>
      <p style="margin:16px 0 0;font-size:13px;color:#718096">
        Ce lien expire le ${expires}.<br>
        Si vous n'attendiez pas cette invitation, ignorez ce message.
      </p>
    </div>
  `;

  await sendEmail({
    to: params.to,
    subject: `Invitation à rejoindre ${params.organizationName} sur Physalis`,
    text,
    html,
  });
}

export type WelcomeEmailParams = {
  to: string;
  clientName: string;
  loginUrl: string;
  /** null pour le plan FREE (pas de trial). */
  trialEndsAt: Date | null;
  plan: "free" | "shared" | "dedicated";
};

export async function sendWelcomeEmail(params: WelcomeEmailParams): Promise<void> {
  // FREE = gratuit permanent, pas de mention de trial.
  // SHARED/DEDICATED = trial 14j avec date d'expiration.
  const trialLine =
    params.plan === "free" || !params.trialEndsAt
      ? "Votre offre est gratuite et permanente — pas de date d'expiration."
      : `Votre période d'essai de 14 jours expire le ${params.trialEndsAt.toISOString().split("T")[0]}.`;

  const text = [
    `Bienvenue sur Physalis,`,
    ``,
    `Le compte ${params.clientName} a été créé avec succès (offre ${params.plan}).`,
    ``,
    `URL d'accès :`,
    params.loginUrl,
    ``,
    trialLine,
    ``,
    `À très vite,`,
    `L'équipe Physalis`,
  ].join("\n");

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a2e">
      <h2 style="margin:0 0 16px;font-size:20px">Bienvenue sur Physalis</h2>
      <p style="margin:0 0 12px">
        Le compte <strong>${params.clientName}</strong> a été créé avec succès
        (offre <strong>${params.plan}</strong>).
      </p>
      <a href="${params.loginUrl}"
         style="display:inline-block;margin:16px 0;padding:12px 24px;background:#1a1f35;color:#fff;border-radius:8px;text-decoration:none;font-weight:500">
        Accéder à mon espace
      </a>
      <p style="margin:16px 0 0;font-size:13px;color:#718096">
        ${trialLine}
      </p>
    </div>
  `;

  await sendEmail({
    to: params.to,
    subject: `Bienvenue sur Physalis — ${params.clientName}`,
    text,
    html,
  });
}

export type PasswordResetEmailParams = {
  to: string;
  resetUrl: string;
  expiresAt: Date;
};

/**
 * Email avec lien de reset de mot de passe. Le lien contient le token
 * brut — il faut donc passer par HTTPS (le sous-domaine tenant l'est par
 * défaut sur Physalis prod). Le contenu du mail ne dévoile aucune info
 * personnelle (par design : on ne sait pas si l'email correspond à un
 * compte ou pas — voir /forgot-password qui répond toujours OK).
 */
export async function sendPasswordResetEmail(
  params: PasswordResetEmailParams,
): Promise<void> {
  const expires = params.expiresAt.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
  });

  const text = [
    `Bonjour,`,
    ``,
    `Vous (ou quelqu'un d'autre) avez demandé la réinitialisation du mot de passe pour ce compte sur Physalis.`,
    ``,
    `Pour définir un nouveau mot de passe, cliquez sur ce lien :`,
    params.resetUrl,
    ``,
    `Ce lien est valable jusqu'au ${expires} et ne peut être utilisé qu'une seule fois.`,
    ``,
    `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message — votre mot de passe actuel reste valide.`,
  ].join("\n");

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a2e">
      <h2 style="margin:0 0 16px;font-size:20px">Réinitialisation du mot de passe</h2>
      <p style="margin:0 0 12px">
        Vous (ou quelqu'un d'autre) avez demandé la réinitialisation du mot de
        passe pour ce compte sur <strong>Physalis</strong>.
      </p>
      <a href="${params.resetUrl}"
         style="display:inline-block;margin:16px 0;padding:12px 24px;background:#1a1f35;color:#fff;border-radius:8px;text-decoration:none;font-weight:500">
        Définir un nouveau mot de passe
      </a>
      <p style="margin:16px 0 0;font-size:13px;color:#718096">
        Ce lien est valable jusqu'au ${expires} et ne peut être utilisé qu'une seule fois.<br>
        Si vous n'êtes pas à l'origine de cette demande, ignorez ce message — votre mot de passe actuel reste valide.
      </p>
    </div>
  `;

  await sendEmail({
    to: params.to,
    subject: `Réinitialisation de votre mot de passe Physalis`,
    text,
    html,
  });
}

export type SecretRequestEmailParams = {
  to: string;
  requesterEmail: string;
  label: string;
  description: string | null;
  requestUrl: string;
  expiresAt: Date;
};

/**
 * Email envoyé au destinataire externe d'une SecretRequest. Contient
 * uniquement le lien (qui contient le token) — le secret réel est saisi
 * par le destinataire dans son navigateur, chiffré côté client.
 */
export async function sendSecretRequestEmail(
  params: SecretRequestEmailParams,
): Promise<void> {
  const expires = params.expiresAt.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
  });

  const text = [
    `Bonjour,`,
    ``,
    `${params.requesterEmail} (via Physalis) vous demande de partager :`,
    `« ${params.label} »`,
    ...(params.description ? [``, params.description] : []),
    ``,
    `Pour transmettre votre secret de façon sécurisée :`,
    params.requestUrl,
    ``,
    `Le secret sera chiffré dans votre navigateur avant envoi — Physalis ne peut pas le lire.`,
    ``,
    `Ce lien expire le ${expires} et ne peut être utilisé qu'une seule fois.`,
    ``,
    `Si vous n'attendiez pas cette demande, ignorez ce message.`,
  ].join("\n");

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a2e">
      <h2 style="margin:0 0 16px;font-size:20px">Demande de secret sécurisée</h2>
      <p style="margin:0 0 12px">
        <strong>${params.requesterEmail}</strong> (via Physalis) vous demande de partager :
      </p>
      <p style="margin:0 0 12px;padding:12px;background:#f5f5f5;border-radius:8px;font-weight:500">
        ${params.label}
      </p>
      ${params.description ? `<p style="margin:0 0 12px;color:#4a5568">${params.description}</p>` : ""}
      <a href="${params.requestUrl}"
         style="display:inline-block;margin:16px 0;padding:12px 24px;background:#1a1f35;color:#fff;border-radius:8px;text-decoration:none;font-weight:500">
        Transmettre le secret
      </a>
      <p style="margin:16px 0 0;font-size:13px;color:#718096">
        🔐 Le secret est chiffré dans votre navigateur avant envoi — Physalis ne peut pas le lire.<br>
        Ce lien expire le ${expires} et ne peut être utilisé qu'une seule fois.
      </p>
    </div>
  `;

  await sendEmail({
    to: params.to,
    subject: `${params.requesterEmail} vous demande de partager un secret`,
    text,
    html,
  });
}

export type SecretReceivedEmailParams = {
  to: string;
  label: string;
  submitterIp: string | null;
  reviewUrl: string;
};

/**
 * Notification à l'admin (= author de la SecretRequest) quand le destinataire
 * vient de soumettre son secret. Permet de réagir rapidement (révéler /
 * importer / révoquer si timing suspect).
 */
export async function sendSecretReceivedEmail(
  params: SecretReceivedEmailParams,
): Promise<void> {
  const text = [
    `Bonjour,`,
    ``,
    `Le secret demandé pour « ${params.label} » vient d'être transmis sur Physalis.`,
    ...(params.submitterIp ? [``, `IP du soumetteur : ${params.submitterIp}`] : []),
    ``,
    `Pour le révéler et l'importer :`,
    params.reviewUrl,
    ``,
    `Si ce timing ne correspond pas à ce que vous attendiez, révoquez la demande sans la révéler.`,
  ].join("\n");

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a2e">
      <h2 style="margin:0 0 16px;font-size:20px">Secret reçu</h2>
      <p style="margin:0 0 12px">
        Le secret demandé pour <strong>« ${params.label} »</strong> vient d'être
        transmis sur Physalis.
      </p>
      ${params.submitterIp ? `<p style="margin:0 0 12px;font-size:13px;color:#4a5568">IP du soumetteur : <code>${params.submitterIp}</code></p>` : ""}
      <a href="${params.reviewUrl}"
         style="display:inline-block;margin:16px 0;padding:12px 24px;background:#1a1f35;color:#fff;border-radius:8px;text-decoration:none;font-weight:500">
        Révéler le secret
      </a>
      <p style="margin:16px 0 0;font-size:13px;color:#718096">
        Si ce timing ne correspond pas à ce que vous attendiez, révoquez la
        demande sans la révéler.
      </p>
    </div>
  `;

  await sendEmail({
    to: params.to,
    subject: `Secret reçu : ${params.label}`,
    text,
    html,
  });
}

export type ShareConsumedEmailParams = {
  to: string;
  title: string | null;
  createdAt: Date;
  consumedAt: Date;
  viewedFromIp: string | null;
};

/**
 * Notification au createur d'un OneTimeShare quand il vient d'etre consomme.
 * Permet de detecter rapidement un detournement (consommation a une heure /
 * IP non attendue). Le contenu reel n'est PAS dans l'email — seulement la
 * metadata.
 */
export async function sendShareConsumedEmail(
  params: ShareConsumedEmailParams,
): Promise<void> {
  const label = params.title?.trim() || "Sans titre";
  const consumed = params.consumedAt.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
  });
  const created = params.createdAt.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
  });
  const ip = params.viewedFromIp ?? "inconnue";

  const text = [
    `Bonjour,`,
    ``,
    `Votre partage "${label}" a été consommé sur Physalis.`,
    ``,
    `Créé le : ${created}`,
    `Consommé le : ${consumed}`,
    `Depuis l'IP : ${ip}`,
    ``,
    `Si ce n'est pas vous (ou la personne à qui vous l'avez envoyé), considerez le contenu comme compromis et changez-le si besoin.`,
  ].join("\n");

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a2e">
      <h2 style="margin:0 0 16px;font-size:20px">Partage consommé</h2>
      <p style="margin:0 0 12px">
        Votre partage <strong>"${label}"</strong> vient d'être ouvert sur Physalis.
      </p>
      <table style="margin:16px 0;font-size:14px;color:#4a5568">
        <tr><td style="padding:4px 12px 4px 0">Créé le :</td><td>${created}</td></tr>
        <tr><td style="padding:4px 12px 4px 0">Consommé le :</td><td>${consumed}</td></tr>
        <tr><td style="padding:4px 12px 4px 0">Depuis l'IP :</td><td><code>${ip}</code></td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:13px;color:#718096">
        Si ce n'est pas vous (ou la personne destinataire), considérez le
        contenu comme compromis et changez-le si besoin.
      </p>
    </div>
  `;

  await sendEmail({
    to: params.to,
    subject: `Partage "${label}" consommé`,
    text,
    html,
  });
}