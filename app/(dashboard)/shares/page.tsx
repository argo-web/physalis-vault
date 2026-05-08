import Link from "next/link";
import { RiShareForward2Line } from "@remixicon/react";
import { auth } from "@/lib/auth";
import SharesTabs from "./shares-tabs";

export default async function SharesPage() {
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
              <RiShareForward2Line size={22} aria-hidden /> Partages
            </h1>
            <div className="page-subtitle">
              Hub des partages sécurisés. <br />
              <strong>Mes partages</strong> :
              liens à usage unique que vous transmettez (chiffrés via fragment
              URL). <br />
              <strong>Demandes externes</strong> : invitez un tiers à
              partager un secret avec vous (ECDH côté navigateur, sans compte
              requis).
            </div>
          </div>
        </div>

        <SharesTabs />
      </div>
    </div>
  );
}
