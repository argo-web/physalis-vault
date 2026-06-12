"use client";

import { useEffect, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { signIn } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";

export type ExtPluginSession = {
  sessionToken: string;
  expiresAt: number;
  email: string;
  tenantSlug: string;
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--accent-soft)",
  background: "var(--accent-bg)",
  borderRadius: 8,
  padding: "10px 14px",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

export default function PluginLoginProposal({
  session,
  onUseOtherAccount,
}: {
  session: ExtPluginSession;
  onUseOtherAccount: () => void;
}) {
  const t = useTranslations("auth.pluginLogin");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const params = useSearchParams();
  // Le router vient de @/i18n/navigation : il préfixe automatiquement
  // la locale active. Garder un path "/dashboard" nu — pas de préfixage
  // manuel sous peine de double prefix ("/fr/fr/dashboard").
  const callbackUrl = params.get("callbackUrl") || "/dashboard";
  const autoLogin = params.get("autoLogin") === "1";

  function loginWithExtension() {
    if (pending) return;
    if (
      typeof window !== "undefined" &&
      window.location.hostname === "vault.physalis.cloud" &&
      session.tenantSlug
    ) {
      window.location.assign(
        `https://${session.tenantSlug}.physalis.cloud/${locale}/login?autoLogin=1`,
      );
      return;
    }
    startTransition(async () => {
      const res = await signIn("credentials", {
        pluginToken: session.sessionToken,
        tenantSlug: session.tenantSlug,
        redirect: false,
      });
      if (res?.ok) {
        router.push(callbackUrl);
        router.refresh();
      }
    });
  }

  useEffect(() => {
    if (autoLogin) loginWithExtension();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={loginWithExtension}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") loginWithExtension(); }}
        aria-disabled={pending}
        style={{ ...cardStyle, opacity: pending ? 0.7 : 1, cursor: pending ? "default" : "pointer" }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
          {t("workspace", { tenantSlug: capitalize(session.tenantSlug) })}
        </span>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {pending ? t("signingIn") : t("connectAs")}
          </span>
          {!pending && <span style={{ color: "var(--accent)" }}>→</span>}
        </div>
        {!pending && (
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--accent)" }}>
            {session.email}
          </span>
        )}
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={onUseOtherAccount}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onUseOtherAccount(); }}
        style={cardStyle}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--accent)" }}>
            {t("useOtherAccount")}
          </span>
          <span style={{ color: "var(--accent)" }}>→</span>
        </div>
      </div>
    </div>
  );
}
