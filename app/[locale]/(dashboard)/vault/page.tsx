import Link from "next/link";
import { RiSafe2Line } from "@remixicon/react";
import { auth } from "@/lib/auth";
import VaultPanel from "./vault-panel";

export default async function VaultPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  return (
    <div className="page">
      <div className="page-content">
        <div className="breadcrumb">
          <Link href="/dashboard">← Tableau de bord</Link>
        </div>
        <div className="page-header">
          <div>
            <h1 className="page-title">
              <RiSafe2Line size={22} aria-hidden /> Coffre personnel
            </h1>
            <div className="page-subtitle">
              Tes credentials privés. Aucun partage, visibles uniquement par toi.
            </div>
          </div>
        </div>

        <VaultPanel />
      </div>
    </div>
  );
}
