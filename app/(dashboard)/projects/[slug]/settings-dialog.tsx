"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { defaultDeployPath } from "@/lib/validation";

type EnvSummary = {
  id: string;
  name: string;
  url: string | null;
  serverId: string | null;
  deployPath: string | null;
  secretCount: number;
};

type ServerOption = {
  id: string;
  name: string;
  ip: string;
  sshUser: string;
};

export default function SettingsDialog({
  slug,
  orgSlug,
  projectName,
  githubRepo,
  githubWorkflow,
  environments,
  onClose,
}: {
  slug: string;
  orgSlug: string;
  projectName: string;
  githubRepo: string | null;
  githubWorkflow: string | null;
  environments: EnvSummary[];
  onClose: () => void;
}) {
  const [servers, setServers] = useState<ServerOption[] | null>(null);
  const [serversError, setServersError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/orgs/${orgSlug}/servers`);
      if (cancelled) return;
      if (!res.ok) {
        setServers([]);
        if (res.status !== 403) {
          setServersError("Impossible de charger la liste des serveurs.");
        }
        return;
      }
      const data = (await res.json()) as { servers: ServerOption[] };
      setServers(data.servers);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  return (
    <div className="dialog-overlay">
      <div className="dialog dialog-lg">
        <div className="dialog-header">
          <h2 className="dialog-title">Paramètres du projet</h2>
          <button
            type="button"
            onClick={onClose}
            className="dialog-close"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="dialog-body">
          <ProjectNameSection slug={slug} initialName={projectName} />
          <GithubSection
            slug={slug}
            initialRepo={githubRepo}
            initialWorkflow={githubWorkflow}
          />
          <EnvironmentsSection
            slug={slug}
            environments={environments}
            servers={servers}
            serversError={serversError}
          />
        </div>
      </div>
    </div>
  );
}

function GithubSection({
  slug,
  initialRepo,
  initialWorkflow,
}: {
  slug: string;
  initialRepo: string | null;
  initialWorkflow: string | null;
}) {
  const router = useRouter();
  const [repo, setRepo] = useState(initialRepo ?? "");
  const [workflow, setWorkflow] = useState(initialWorkflow ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty =
    repo.trim() !== (initialRepo ?? "") ||
    workflow.trim() !== (initialWorkflow ?? "");

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const body: Record<string, string | null> = {};
      const repoTrim = repo.trim();
      const wfTrim = workflow.trim();
      body.githubRepo = repoTrim === "" ? null : repoTrim;
      body.githubWorkflow = wfTrim === "" ? null : wfTrim;

      const res = await fetch(`/api/projects/${slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Modification impossible.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section>
      <h3 className="section-title" style={{ fontSize: 14, marginBottom: 8 }}>
        GitHub Actions (Redeploy)
      </h3>
      <form onSubmit={save} className="flex flex-col gap-2">
        <div className="field">
          <label>
            Repo GitHub (format <code className="code-mono">owner/repo</code>)
          </label>
          <input
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="argo-web/voyages"
            className="input input-mono"
          />
        </div>
        <div className="field">
          <label>
            Workflow file (défaut{" "}
            <code className="code-mono">redeploy.yml</code>)
          </label>
          <input
            value={workflow}
            onChange={(e) => setWorkflow(e.target.value)}
            placeholder="redeploy.yml"
            className="input input-mono"
          />
        </div>
        <p className="help">
          Le bouton Redeploy déclenche un{" "}
          <code className="code-mono">workflow_dispatch</code> sur ce workflow.
          Le PAT GitHub doit être stocké dans le secret org{" "}
          <code className="code-mono">GITHUB_DISPATCH_TOKEN</code>.
        </p>
        {error && <p className="error-text">{error}</p>}
        <div>
          <button
            type="submit"
            disabled={!dirty || pending}
            className="btn btn-primary btn-sm"
          >
            {pending ? "..." : "Enregistrer"}
          </button>
        </div>
      </form>
    </section>
  );
}

function ProjectNameSection({
  slug,
  initialName,
}: {
  slug: string;
  initialName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [slugInput, setSlugInput] = useState(slug);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const trimmedName = name.trim();
  const trimmedSlug = slugInput.trim();
  const slugChanged = trimmedSlug !== slug;
  const nameChanged = trimmedName !== initialName && trimmedName.length > 0;
  const dirty = nameChanged || (slugChanged && trimmedSlug.length > 0);

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (slugChanged) {
      const ok = confirm(
        `⚠ Vous changez le slug du projet de "${slug}" à "${trimmedSlug}".\n\n` +
          `Conséquences :\n` +
          `• Les scripts utilisant l'URL Bearer machine \n  /api/secrets/${slug}/<env>\n  retourneront 403 jusqu'à ce qu'ils soient mis à jour avec le nouveau slug.\n` +
          `• Les bookmarks /projects/${slug} ne fonctionnent plus.\n\n` +
          `Pas besoin de regénérer les machine tokens (ils restent valides) ni de toucher au PAT GitHub. Continuer ?`,
      );
      if (!ok) return;
    }
    startTransition(async () => {
      const body: Record<string, string> = {};
      if (nameChanged) body.name = trimmedName;
      if (slugChanged) body.slug = trimmedSlug;
      const res = await fetch(`/api/projects/${slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Modification impossible.");
        return;
      }
      if (slugChanged) {
        router.push(`/projects/${trimmedSlug}`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <section>
      <h3 className="section-title" style={{ fontSize: 14, marginBottom: 8 }}>
        Identité du projet
      </h3>
      <form onSubmit={save} className="flex flex-col gap-2">
        <div className="form-row">
          <div className="field">
            <label>Nom</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="input"
            />
          </div>
          <div className="field">
            <label>Slug (URL et endpoint Bearer machine)</label>
            <input
              value={slugInput}
              onChange={(e) =>
                setSlugInput(e.target.value.toLowerCase().replace(/\s+/g, "-"))
              }
              required
              className="input input-mono"
            />
          </div>
        </div>
        {slugChanged && (
          <p className="help text-accent">
            ⚠ Changer le slug casse les scripts qui hardcodent l&apos;URL{" "}
            <code className="code-mono">/api/secrets/{slug}/&lt;env&gt;</code>.
            Le token machine reste valide, seul l&apos;URL change.
          </p>
        )}
        {error && <p className="error-text">{error}</p>}
        <div>
          <button
            type="submit"
            disabled={!dirty || pending}
            className="btn btn-primary btn-sm"
          >
            {pending ? "..." : "Enregistrer"}
          </button>
        </div>
      </form>
    </section>
  );
}

function EnvironmentsSection({
  slug,
  environments,
  servers,
  serversError,
}: {
  slug: string;
  environments: EnvSummary[];
  servers: ServerOption[] | null;
  serversError: string | null;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  return (
    <section>
      <div className="section-header">
        <h3 className="section-title" style={{ fontSize: 14 }}>
          Environnements
        </h3>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="btn btn-ghost btn-xs"
          >
            + Ajouter
          </button>
        )}
      </div>

      {serversError && (
        <p className="help text-accent" style={{ marginBottom: 8 }}>
          {serversError}
        </p>
      )}

      {adding && (
        <div className="create-card">
          <AddEnvForm
            slug={slug}
            servers={servers}
            onCancel={() => setAdding(false)}
            onCreated={() => {
              setAdding(false);
              router.refresh();
            }}
          />
        </div>
      )}

      <div className="row-list">
        {environments.map((env) => (
          <EnvRow
            key={env.id}
            slug={slug}
            env={env}
            servers={servers}
            onChanged={() => router.refresh()}
          />
        ))}
      </div>
    </section>
  );
}

function AddEnvForm({
  slug,
  servers,
  onCancel,
  onCreated,
}: {
  slug: string;
  servers: ServerOption[] | null;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [serverId, setServerId] = useState("");
  const [deployPath, setDeployPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const body: Record<string, string | null | undefined> = { name };
      if (url.trim()) body.url = url.trim();
      if (serverId) body.serverId = serverId;
      if (deployPath.trim()) body.deployPath = deployPath.trim();

      const res = await fetch(`/api/projects/${slug}/environments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Création impossible.");
        return;
      }
      onCreated();
    });
  }

  const previewName = name.trim() || "<env>";
  const deployPathPlaceholder = `${defaultDeployPath(previewName, slug)} (défaut)`;

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="form-row">
        <div className="field">
          <label>Nom</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase())}
            placeholder="qa"
            className="input input-mono"
          />
        </div>
        <div className="field" style={{ flex: 2 }}>
          <label>URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://qa.example.com (optionnel)"
            className="input"
          />
        </div>
      </div>
      <div className="field">
        <label>Deploy path</label>
        <input
          value={deployPath}
          onChange={(e) => setDeployPath(e.target.value)}
          placeholder={deployPathPlaceholder}
          className="input input-mono"
        />
      </div>
      <div className="field">
        <label>Serveur</label>
        <ServerSelect
          servers={servers}
          value={serverId}
          onChange={setServerId}
        />
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="btn btn-primary btn-sm"
        >
          {pending ? "..." : "Créer"}
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

function ServerSelect({
  servers,
  value,
  onChange,
}: {
  servers: ServerOption[] | null;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="select"
    >
      <option value="">— Aucun serveur —</option>
      {servers?.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} ({s.sshUser}@{s.ip})
        </option>
      ))}
    </select>
  );
}

function EnvRow({
  slug,
  env,
  servers,
  onChanged,
}: {
  slug: string;
  env: EnvSummary;
  servers: ServerOption[] | null;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(env.name);
  const [url, setUrl] = useState(env.url ?? "");
  const [serverId, setServerId] = useState(env.serverId ?? "");
  const [deployPath, setDeployPath] = useState(env.deployPath ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty =
    name !== env.name ||
    url !== (env.url ?? "") ||
    serverId !== (env.serverId ?? "") ||
    deployPath !== (env.deployPath ?? "");

  const linkedServer = env.serverId
    ? servers?.find((s) => s.id === env.serverId)
    : null;

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const body: Record<string, string | null | undefined> = {};
      if (name !== env.name) body.name = name;
      if (url !== (env.url ?? "")) body.url = url.trim() || null;
      if (serverId !== (env.serverId ?? "")) {
        body.serverId = serverId === "" ? null : serverId;
      }
      if (deployPath !== (env.deployPath ?? "")) {
        body.deployPath = deployPath.trim() || null;
      }
      const res = await fetch(
        `/api/projects/${slug}/environments/${encodeURIComponent(env.name)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Modification impossible.");
        return;
      }
      setEditing(false);
      onChanged();
    });
  }

  function remove() {
    if (
      !confirm(
        `Supprimer l'environnement "${env.name}" ?\n\nCela supprimera ${env.secretCount} secret(s) et tous les machine tokens de cet environnement (cascade).`,
      )
    )
      return;
    startTransition(async () => {
      const res = await fetch(
        `/api/projects/${slug}/environments/${encodeURIComponent(env.name)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Suppression impossible.");
        return;
      }
      onChanged();
    });
  }

  if (!editing) {
    return (
      <div className="row">
        <div className="row-icon">{env.name.slice(0, 2).toUpperCase()}</div>
        <div className="row-info">
          <div className="row-name">
            <span className="code-mono">{env.name}</span>
            {linkedServer && (
              <span
                className="code-mono text-muted"
                style={{ fontSize: 12, marginLeft: 6, fontWeight: 400 }}
              >
                ({linkedServer.name})
              </span>
            )}
            {!linkedServer && env.serverId && (
              <span
                className="code-mono text-muted"
                style={{ fontSize: 12, marginLeft: 6, fontWeight: 400 }}
              >
                (introuvable)
              </span>
            )}
          </div>
          <div className="row-meta">
            {env.url && <span>{env.url}</span>}
          </div>
          {error && <p className="error-text">{error}</p>}
        </div>
        <div className="row-actions">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn btn-ghost btn-xs"
          >
            Modifier
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="btn btn-danger btn-xs"
          >
            Supprimer
          </button>
        </div>
      </div>
    );
  }

  const previewName = name.trim() || "<env>";
  const deployPathPlaceholder = `${defaultDeployPath(previewName, slug)} (défaut)`;

  return (
    <div className="card">
      <form onSubmit={save} className="flex flex-col gap-2">
        <div className="form-row">
          <div className="field">
            <label>Nom</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              className="input input-mono"
            />
          </div>
          <div className="field" style={{ flex: 2 }}>
            <label>URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="URL (optionnel)"
              className="input"
            />
          </div>
        </div>
        <div className="field">
          <label>Deploy path</label>
          <input
            value={deployPath}
            onChange={(e) => setDeployPath(e.target.value)}
            placeholder={deployPathPlaceholder}
            className="input input-mono"
          />
        </div>
        <div className="field">
          <label>Serveur</label>
          <ServerSelect
            servers={servers}
            value={serverId}
            onChange={setServerId}
          />
        </div>
        {name !== env.name && (
          <p className="help text-accent">
            ⚠ Renommer l&apos;env casse les scripts de deploy qui pointent sur
            l&apos;ancien nom (URL Bearer machine token).
          </p>
        )}
        {error && <p className="error-text">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending || !dirty}
            className="btn btn-primary btn-sm"
          >
            {pending ? "..." : "Enregistrer"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setName(env.name);
              setUrl(env.url ?? "");
              setServerId(env.serverId ?? "");
              setDeployPath(env.deployPath ?? "");
              setError(null);
            }}
            className="btn btn-ghost btn-sm"
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
