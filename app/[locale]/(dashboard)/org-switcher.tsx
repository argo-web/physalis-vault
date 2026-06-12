"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import type { OrgRole } from "@prisma/client";

type Org = { id: string; name: string; slug: string; role: OrgRole };

export default function OrgSwitcher({
  organizations,
  currentSlug,
}: {
  organizations: Org[];
  currentSlug: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const t = useTranslations("dashboard.orgSwitcher");
  const current = organizations.find((o) => o.slug === currentSlug);

  async function setCurrentOrg(slug: string): Promise<boolean> {
    const res = await fetch("/api/me/current-org", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    return res.ok;
  }

  function switchTo(slug: string) {
    startTransition(async () => {
      if (await setCurrentOrg(slug)) {
        setOpen(false);
        // push() est no-op si on est déjà sur /dashboard → on enchaîne avec
        // refresh() pour invalider le cache RSC et que le layout re-fetch
        // currentSlug. Sur les autres pages, push() navigue + Next fetch
        // la nouvelle route, le refresh() est redondant mais inoffensif.
        router.push("/dashboard");
        router.refresh();
      }
    });
  }

  function switchAndOpenSettings(slug: string) {
    startTransition(async () => {
      if (await setCurrentOrg(slug)) {
        setOpen(false);
        router.push(`/orgs/${slug}`);
        router.refresh();
      }
    });
  }

  function createOrg(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (res.ok) {
        const data = (await res.json()) as { organization: { slug: string } };
        await setCurrentOrg(data.organization.slug);
        setNewName("");
        setCreating(false);
        setOpen(false);
        router.push("/dashboard");
        router.refresh();
      }
    });
  }

  if (organizations.length === 0) return null;

  function SettingsIcon() {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="org-pill"
      >
        <span>{current?.name ?? t("placeholder")}</span>
        <span className="chev">▾</span>
      </button>

      {open && (
        <>
        <div
          className="fixed inset-0 z-10"
          onClick={() => setOpen(false)}
          aria-hidden
        />
        <div className="absolute left-0 top-full mt-2 w-72 rounded-xl border border-border bg-surface shadow-lg z-20 overflow-hidden">
          <ul className="max-h-72 overflow-auto">
            {organizations.map((org) => (
              <li
                key={org.id}
                className={`flex items-center gap-1 ${
                  org.slug === currentSlug ? "bg-accent-bg" : ""
                }`}
              >
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => switchTo(org.slug)}
                  className="flex-1 text-left px-3 py-2.5 text-sm hover:bg-code-bg transition-colors min-w-0"
                >
                  <div className="truncate font-medium">{org.name}</div>
                  <div
                    className="text-xs text-muted mt-0.5"
                    style={{ textTransform: "lowercase" }}
                  >
                    {org.role.toLowerCase()}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => switchAndOpenSettings(org.slug)}
                  disabled={pending}
                  aria-label={t("orgSettings", { name: org.name })}
                  title={t("openOrg")}
                  className="p-2 mr-1 rounded-md text-muted hover:text-fg hover:bg-code-bg transition-colors"
                >
                  <SettingsIcon />
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-border p-2 bg-bg">
            {creating ? (
              <form onSubmit={createOrg} className="flex flex-col gap-2 p-1">
                <input
                  required
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t("newOrgName")}
                  className="input"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={pending}
                    className="btn btn-primary btn-sm"
                  >
                    {t("create")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false);
                      setNewName("");
                    }}
                    className="btn btn-ghost btn-sm"
                  >
                    {t("cancel")}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="w-full text-left text-xs px-2 py-1.5 text-muted hover:text-fg transition-colors"
              >
                {t("newOrg")}
              </button>
            )}
          </div>
        </div>
        </>
      )}
    </div>
  );
}
