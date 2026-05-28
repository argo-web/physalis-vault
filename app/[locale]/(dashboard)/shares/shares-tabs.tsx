"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import SharesList from "./shares-list";
import SecretRequestsTab from "./secret-requests-tab";
import SecretRequestCreateButton from "./secret-request-create-button";
import ShareCreateButton from "../share-create-button";

type Tab = "mine" | "external";

export default function SharesTabs() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initial: Tab = sp.get("tab") === "external" ? "external" : "mine";
  const [tab, setTab] = useState<Tab>(initial);

  // Compteur incrémenté quand une demande est créée → SecretRequestsTab
  // se reload via cette key change.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(sp.toString());
    if (tab === "external") params.set("tab", "external");
    else params.delete("tab");
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [tab, pathname, router, sp]);

  return (
    <div className="flex flex-col gap-4">
      <div
        className="tab-bar"
        style={{ display: "flex", justifyContent: "space-between" }}
      >
        <div style={{ display: "flex" }}>
          <button
            type="button"
            className={`tab ${tab === "mine" ? "active" : ""}`}
            onClick={() => setTab("mine")}
          >
            Mes partages
          </button>
          <button
            type="button"
            className={`tab ${tab === "external" ? "active" : ""}`}
            onClick={() => setTab("external")}
          >
            Demandes externes
          </button>
        </div>
        {/* Bouton d'action contextuel — toujours à droite, change selon
            l'onglet actif. */}
        {tab === "mine" ? (
          <ShareCreateButton />
        ) : (
          <SecretRequestCreateButton
            onCreated={() => setRefreshKey((k) => k + 1)}
          />
        )}
      </div>

      {tab === "mine" ? (
        <SharesList />
      ) : (
        <SecretRequestsTab refreshKey={refreshKey} />
      )}
    </div>
  );
}
