"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { OrgRole } from "@prisma/client";
import { RiServerLine } from "@remixicon/react";

type ServerListItem = {
  id: string;
  name: string;
  ip: string;
  sshUser: string;
  createdAt: string;
  updatedAt: string;
  environmentCount: number;
};

const ORG_ROLE_RANK: Record<OrgRole, number> = {
  MEMBER: 1,
  DEV: 2,
  ADMIN_DEV: 3,
  ADMIN: 4,
  OWNER: 5,
};

export default function ServersPanel({
  slug,
  role,
}: {
  slug: string;
  role: OrgRole;
}) {
  const [servers, setServers] = useState<ServerListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // DEV+ peut lire la liste/détails. ADMIN+ peut créer/modifier/supprimer.
  const canRead = ORG_ROLE_RANK[role] >= ORG_ROLE_RANK.DEV;
  const canManage = ORG_ROLE_RANK[role] >= ORG_ROLE_RANK.ADMIN;

  const reload = useCallback(async () => {
    if (!canRead) {
      setServers([]);
      return;
    }
    setError(null);
    const res = await fetch(`/api/orgs/${slug}/servers`);
    if (!res.ok) {
      setError("Erreur de chargement.");
      return;
    }
    const data = (await res.json()) as { servers: ServerListItem[] };
    setServers(data.servers);
  }, [slug, canRead]);

  useEffect(() => {
    setServers(null);
    setEditId(null);
    setAdding(false);
    reload();
  }, [reload]);

  async function remove(server: ServerListItem) {
    const detail =
      server.environmentCount > 0
        ? `\n\n⚠ ${server.environmentCount} environnement(s) y sont actuellement liés. Ils seront détachés (deploy bloqué tant qu'aucun nouveau serveur n'est assigné).`
        : "";
    if (!confirm(`Supprimer le serveur "${server.name}" ?${detail}`)) return;
    const res = await fetch(`/api/orgs/${slug}/servers/${server.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError("Suppression impossible.");
      return;
    }
    reload();
  }

  if (!canRead) {
    return (
      <p className="help">Réservé aux DEV/ADMIN/OWNER de l&apos;organisation.</p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="section-header">
        <div>
          <h2 className="section-title">Serveurs</h2>
          <p className="help" style={{ marginTop: 4 }}>
            VPS cibles pour les déploiements OIDC. Une clé SSH privée par
            serveur — la clé est <strong>chiffrée au repos</strong> et n&apos;est{" "}
            <strong>jamais relue</strong> après création (rotation = nouveau
            serveur).
          </p>
        </div>
        {!adding && canManage && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="btn btn-primary btn-sm"
          >
            + Ajouter
          </button>
        )}
      </div>

      {adding && (
        <div className="create-card">
          <ServerForm
            slug={slug}
            onCancel={() => setAdding(false)}
            onSaved={() => {
              setAdding(false);
              reload();
            }}
          />
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {servers === null ? (
        <p className="help">Chargement…</p>
      ) : servers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">Aucun serveur configuré</div>
        </div>
      ) : (
        <div className="row-list">
          {servers.map((s) =>
            editId === s.id ? (
              <div key={s.id} className="card">
                <ServerEditForm
                  slug={slug}
                  server={s}
                  onCancel={() => setEditId(null)}
                  onSaved={() => {
                    setEditId(null);
                    reload();
                  }}
                />
              </div>
            ) : (
              <div key={s.id} className="row">
                <div className="row-icon"><RiServerLine size={18} aria-hidden /></div>
                <div className="row-info">
                  <div className="row-name">{s.name}</div>
                  <div className="row-meta">
                    <span className="code-mono">
                      {s.sshUser}@{s.ip}
                    </span>
                    <span>
                      · {s.environmentCount} environnement
                      {s.environmentCount === 1 ? "" : "s"} lié
                      {s.environmentCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                {canManage && (
                  <div className="row-actions">
                    <button
                      type="button"
                      onClick={() => setEditId(s.id)}
                      className="btn btn-ghost btn-xs"
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(s)}
                      className="btn btn-danger btn-xs"
                    >
                      Supprimer
                    </button>
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function ServerForm({
  slug,
  onCancel,
  onSaved,
}: {
  slug: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [ip, setIp] = useState("");
  const [sshUser, setSshUser] = useState("github-deploy");
  const [sshPrivateKey, setSshPrivateKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/orgs/${slug}/servers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, ip, sshUser, sshPrivateKey }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Création impossible.");
        return;
      }
      onSaved();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="form-row">
        <div className="field">
          <label>Nom</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="prod-vps-1"
            className="input"
          />
        </div>
        <div className="field">
          <label>IP / hostname</label>
          <input
            required
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="51.x.x.x"
            className="input input-mono"
          />
        </div>
        <div className="field">
          <label>Utilisateur SSH</label>
          <input
            required
            value={sshUser}
            onChange={(e) => setSshUser(e.target.value)}
            placeholder="github-deploy"
            className="input input-mono"
          />
        </div>
      </div>
      <div className="field">
        <label>
          Clé SSH privée (PEM/OpenSSH, collée en clair, sera chiffrée AES-256-GCM)
        </label>
        <textarea
          required
          value={sshPrivateKey}
          onChange={(e) => setSshPrivateKey(e.target.value)}
          rows={8}
          placeholder={
            "-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"
          }
          className="textarea textarea-mono"
        />
      </div>
      <p className="help text-accent">
        ⚠ La clé ne sera <strong>jamais relisible</strong> dans l&apos;UI après
        création. Conservez-la dans votre gestionnaire local le temps de valider
        que le déploiement fonctionne, puis supprimez-la.
      </p>
      {error && <p className="error-text">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary btn-sm"
        >
          {pending ? "Création…" : "Créer"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-ghost btn-sm"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

function ServerEditForm({
  slug,
  server,
  onCancel,
  onSaved,
}: {
  slug: string;
  server: ServerListItem;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(server.name);
  const [ip, setIp] = useState(server.ip);
  const [sshUser, setSshUser] = useState(server.sshUser);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty =
    name !== server.name || ip !== server.ip || sshUser !== server.sshUser;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/orgs/${slug}/servers/${server.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, ip, sshUser }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Modification impossible.");
        return;
      }
      onSaved();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="form-row">
        <div className="field">
          <label>Nom</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
          />
        </div>
        <div className="field">
          <label>IP / hostname</label>
          <input
            required
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            className="input input-mono"
          />
        </div>
        <div className="field">
          <label>Utilisateur SSH</label>
          <input
            required
            value={sshUser}
            onChange={(e) => setSshUser(e.target.value)}
            className="input input-mono"
          />
        </div>
      </div>
      <p className="help">
        Pour faire pivoter la clé SSH : supprimer puis recréer le serveur.
      </p>
      {error && <p className="error-text">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending || !dirty}
          className="btn btn-primary btn-sm"
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-ghost btn-sm"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
