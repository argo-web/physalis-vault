import { headers } from "next/headers";
import Image from "next/image";
import RequestForm from "./request-form";
import {
  hashSecretRequestToken,
  isSecretRequestTokenFormat,
  resolveSecretRequestTenantSlug,
} from "@/lib/secret-request";
import { basePrisma } from "@/lib/prisma";
import { isValidClientSlug } from "@/lib/validation";

export const metadata = {
  title: "Partage sécurisé — Physalis",
};

type RequestData = {
  label: string;
  description: string | null;
  requestedByEmail: string;
  publicKeyJwk: string;
  expiresAt: Date;
};

async function loadRequest(token: string): Promise<RequestData | null> {
  if (!isSecretRequestTokenFormat(token)) return null;
  const tenantSlug = await resolveSecretRequestTenantSlug(token);
  if (!tenantSlug || !isValidClientSlug(tenantSlug)) return null;

  const tokenHash = hashSecretRequestToken(token);
  const rows = await basePrisma.$queryRawUnsafe<RequestData[]>(
    `SELECT label, description, "requestedByEmail", "publicKeyJwk", "expiresAt"
     FROM "client_${tenantSlug}"."SecretRequest"
     WHERE "tokenHash" = $1
       AND "revokedAt" IS NULL
       AND "submittedAt" IS NULL
       AND "expiresAt" > NOW()
     LIMIT 1`,
    tokenHash,
  );
  return rows[0] ?? null;
}

export default async function RequestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // headers() touché avant le query pour rester en dynamic rendering.
  await headers();
  const data = await loadRequest(token);

  if (!data) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-brand">
            <Image
              src="/icon-128.png"
              alt="Physalis"
              width={64}
              height={64}
              className="login-brand-icon"
              priority
            />
            <div className="login-brand-text">
              <div className="login-brand-name">Physalis</div>
              <div className="login-brand-tag">Lien invalide</div>
            </div>
          </div>
          <p className="help" style={{ textAlign: "center" }}>
            Ce lien n&apos;est plus valide. Il a peut-être expiré ou déjà été
            utilisé. Contactez la personne qui vous l&apos;a envoyé pour
            obtenir un nouveau lien.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <Image
            src="/icon-128.png"
            alt="Physalis"
            width={64}
            height={64}
            className="login-brand-icon"
            priority
          />
          <div className="login-brand-text">
            <div className="login-brand-name">Physalis</div>
            <div className="login-brand-tag">Partage sécurisé</div>
          </div>
        </div>
        <RequestForm
          token={token}
          label={data.label}
          description={data.description}
          requestedByEmail={data.requestedByEmail}
          publicKeyJwk={data.publicKeyJwk}
          expiresAt={data.expiresAt.toISOString()}
        />
      </div>
    </div>
  );
}
