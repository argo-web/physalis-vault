import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  Session,
  adminSession,
  postJson,
  patchJson,
  deleteReq,
} from "./helpers/api";
import { execSql, selectRows } from "./helpers/db";

const SUFFIX = `${Date.now()}`;
const SERVER_NAME = `srv-test-${SUFFIX}`;
const SERVER_NAME_2 = `srv-test-${SUFFIX}-2`;
const PROJECT_NAME = `srv-proj-${SUFFIX}`;

const FAKE_SSH_KEY =
  "-----BEGIN OPENSSH PRIVATE KEY-----\n" +
  "FAKE_KEY_MARKER_DO_NOT_LEAK_THIS_TO_DB_PLAINTEXT".repeat(5) +
  "\n-----END OPENSSH PRIVATE KEY-----";

const ORG_SLUG = "admin";

let admin: Session;
let createdServerId = "";
let projectSlug = "";

beforeAll(async () => {
  admin = await adminSession();
});

afterAll(async () => {
  // Cleanup au cas où un test aurait laissé des objets.
  if (projectSlug) {
    await deleteReq(admin, `/api/projects/${projectSlug}`).catch(() => {});
  }
  if (createdServerId) {
    await deleteReq(
      admin,
      `/api/orgs/${ORG_SLUG}/servers/${createdServerId}`,
    ).catch(() => {});
  }
  // Sécurité : retire tout serveur de test résiduel par nom.
  await execSql(
    `DELETE FROM "Server" WHERE name LIKE 'srv-test-${SUFFIX}%'`,
  ).catch(() => {});
});

describe("Server CRUD — admin org", () => {
  it("POST crée un serveur (201) et la clé est chiffrée en DB", async () => {
    const res = await postJson(admin, `/api/orgs/${ORG_SLUG}/servers`, {
      name: SERVER_NAME,
      ip: "203.0.113.42",
      sshUser: "github-deploy",
      sshPrivateKey: FAKE_SSH_KEY,
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as {
      server: { id: string; name: string; ip: string; sshUser: string };
    };
    expect(data.server.name).toBe(SERVER_NAME);
    expect(data.server.ip).toBe("203.0.113.42");
    expect(data.server.sshUser).toBe("github-deploy");
    // La cle privée n'est jamais retournée par l'API.
    expect(JSON.stringify(data)).not.toContain("FAKE_KEY_MARKER");
    createdServerId = data.server.id;

    // Vérification DB : la clé en base est chiffrée (base64), pas le plaintext.
    const rows = await selectRows(
      `SELECT "encryptedKey", iv, tag FROM "Server" WHERE id = '${createdServerId}'`,
    );
    expect(rows.length).toBe(1);
    const [encryptedKey, iv, tag] = rows[0]!.split("|");
    expect(encryptedKey).not.toContain("FAKE_KEY_MARKER");
    expect(encryptedKey).not.toContain("BEGIN OPENSSH");
    expect(encryptedKey).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(iv).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(tag).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("POST refuse une clé SSH invalide → 400", async () => {
    const res = await postJson(admin, `/api/orgs/${ORG_SLUG}/servers`, {
      name: `${SERVER_NAME_2}-bad`,
      ip: "203.0.113.43",
      sshUser: "github-deploy",
      sshPrivateKey: "not a real key",
    });
    expect(res.status).toBe(400);
  });

  it("POST refuse un nom dupliqué → 409", async () => {
    const res = await postJson(admin, `/api/orgs/${ORG_SLUG}/servers`, {
      name: SERVER_NAME,
      ip: "203.0.113.44",
      sshUser: "github-deploy",
      sshPrivateKey: FAKE_SSH_KEY,
    });
    expect(res.status).toBe(409);
  });

  it("GET liste retourne le serveur (sans la clé)", async () => {
    const res = await admin.fetch(`/api/orgs/${ORG_SLUG}/servers`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      servers: Array<{ id: string; name: string }>;
    };
    expect(data.servers.find((s) => s.id === createdServerId)).toBeDefined();
    // Sanity : aucun champ ressemblant à la clé ne fuit.
    expect(JSON.stringify(data)).not.toContain("FAKE_KEY_MARKER");
    expect(JSON.stringify(data)).not.toContain("encryptedKey");
  });

  it("GET détail retourne le serveur (sans la clé)", async () => {
    const res = await admin.fetch(
      `/api/orgs/${ORG_SLUG}/servers/${createdServerId}`,
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("FAKE_KEY_MARKER");
    expect(text).not.toContain("encryptedKey");
    const data = JSON.parse(text) as {
      server: { id: string; name: string; environments: unknown[] };
    };
    expect(data.server.id).toBe(createdServerId);
    expect(Array.isArray(data.server.environments)).toBe(true);
  });

  it("PATCH met à jour ip/sshUser sans toucher à la clé", async () => {
    const res = await patchJson(
      admin,
      `/api/orgs/${ORG_SLUG}/servers/${createdServerId}`,
      { ip: "203.0.113.99", sshUser: "deploy" },
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      server: { ip: string; sshUser: string };
    };
    expect(data.server.ip).toBe("203.0.113.99");
    expect(data.server.sshUser).toBe("deploy");

    // Sanity DB : la cle reste celle initialement stockée.
    const stillEncrypted = await execSql(
      `SELECT "encryptedKey" FROM "Server" WHERE id = '${createdServerId}'`,
    );
    expect(stillEncrypted).not.toContain("FAKE_KEY_MARKER");
    expect(stillEncrypted).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("PATCH refuse un payload contenant sshPrivateKey (silencieux)", async () => {
    // Le PATCH ne supporte pas la rotation, donc une clé fournie est ignorée.
    // On vérifie qu'aucun champ chiffré n'a changé.
    const before = await execSql(
      `SELECT "encryptedKey" FROM "Server" WHERE id = '${createdServerId}'`,
    );
    const res = await patchJson(
      admin,
      `/api/orgs/${ORG_SLUG}/servers/${createdServerId}`,
      { sshPrivateKey: "ROTATION_ATTEMPT" },
    );
    expect(res.status).toBe(200);
    const after = await execSql(
      `SELECT "encryptedKey" FROM "Server" WHERE id = '${createdServerId}'`,
    );
    expect(after).toBe(before);
  });
});

describe("Environment ↔ Server linkage", () => {
  beforeAll(async () => {
    const res = await postJson(admin, "/api/projects", {
      name: PROJECT_NAME,
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { project: { slug: string } };
    projectSlug = data.project.slug;
  });

  it("PATCH env accepte serverId + deployPath", async () => {
    const res = await patchJson(
      admin,
      `/api/projects/${projectSlug}/environments/production`,
      {
        serverId: createdServerId,
        deployPath: "/srv/projets/test-app",
      },
    );
    expect(res.status).toBe(200);

    const get = await admin.fetch(
      `/api/projects/${projectSlug}/environments/production`,
    );
    const env = (await get.json()) as {
      environment: { serverId: string | null; deployPath: string | null };
    };
    expect(env.environment.serverId).toBe(createdServerId);
    expect(env.environment.deployPath).toBe("/srv/projets/test-app");
  });

  it("PATCH env refuse un serverId d'une autre org → 400", async () => {
    // serverId factice (qui n'appartient à aucune org).
    const res = await patchJson(
      admin,
      `/api/projects/${projectSlug}/environments/production`,
      { serverId: "ckdoesnotexist000000000000" },
    );
    expect(res.status).toBe(400);
  });

  it("DELETE server SetNull l'environnement (deploy-path conservé)", async () => {
    const del = await deleteReq(
      admin,
      `/api/orgs/${ORG_SLUG}/servers/${createdServerId}`,
    );
    expect(del.status).toBe(200);
    createdServerId = "";

    const get = await admin.fetch(
      `/api/projects/${projectSlug}/environments/production`,
    );
    const env = (await get.json()) as {
      environment: { serverId: string | null; deployPath: string | null };
    };
    expect(env.environment.serverId).toBe(null);
    expect(env.environment.deployPath).toBe("/srv/projets/test-app");
  });
});

describe("Server CRUD — RBAC", () => {
  it("MEMBER (sans login admin) → 401 sur GET liste", async () => {
    const anon = new Session();
    const res = await anon.fetch(`/api/orgs/${ORG_SLUG}/servers`);
    expect(res.status).toBe(401);
  });

  it("MEMBER (sans login admin) → 401 sur POST create", async () => {
    const anon = new Session();
    const res = await postJson(anon, `/api/orgs/${ORG_SLUG}/servers`, {
      name: `anon-${SUFFIX}`,
      ip: "203.0.113.50",
      sshUser: "github-deploy",
      sshPrivateKey: FAKE_SSH_KEY,
    });
    expect(res.status).toBe(401);
  });
});
