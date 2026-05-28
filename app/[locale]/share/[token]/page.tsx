// Page publique de consommation d'un OneTimeShare. Pas d'auth.
// Server component minimal qui delegue toute la logique au client (le
// decrypt necessite la cle dans le fragment `#`, indisponible cote serveur).

import ShareConsumeClient from "./share-consume-client";

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <div className="login-wrap">
      <ShareConsumeClient token={token} />
    </div>
  );
}
