// Integ tests pour les collections perso V2.0 (cf. coffre-personnel-v2.md).
//
// Couvre :
//   - CRUD collections (POST / GET / PATCH / DELETE)
//   - Isolation user (Bob ne voit jamais celles d'Alice)
//   - VaultEntry.collectionId : POST avec, PATCH pour changer, GET filtré
//   - DELETE collection → SetNull sur ses entries (pas de cascade)
//   - Conflit slug (409)
//   - Import CSV Bitwarden : crée les collections automatiquement
//
// Pré-requis : tenant `client_test` provisionné, admin user créé,
// migrations à jour incluant 20260509120000_vault_personal_collections.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  Session,
  loginAs,
  postJson,
  patchJson,
  deleteReq,
  TENANT_SCHEMA,
  TENANT_SLUG,
} from "./helpers/api";
import { execSql } from "./helpers/db";

const SUFFIX = `${Date.now()}`;
const ALICE_EMAIL = `alice-coll-${SUFFIX}@test.local`;
const BOB_EMAIL = `bob-coll-${SUFFIX}@test.local`;
const PASSWORD = "testpassword12345";
let aliceId = "";
let bobId = "";
let aliceSess: Session;
let bobSess: Session;

async function provisionUser(email: string): Promise<string> {
  const id = "ck" + randomBytes(11).toString("hex");
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."User" (id, email, password, role, "createdAt")
     VALUES ('${id}', '${email}', '${passwordHash}', 'MEMBER', NOW())`,
  );
  // Org + OrgMember pour permettre le login (LOGIN_SUCCESS rattache à primaryOrg).
  const orgId = "ck" + randomBytes(11).toString("hex");
  const orgSlug = email.split("@")[0];
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."Organization" (id, name, slug, "createdAt")
     VALUES ('${orgId}', '${email} org', '${orgSlug}', NOW())`,
  );
  const memId = "ck" + randomBytes(11).toString("hex");
  await execSql(
    `INSERT INTO "${TENANT_SCHEMA}"."OrgMember" (id, "userId", "organizationId", role, "createdAt")
     VALUES ('${memId}', '${id}', '${orgId}', 'OWNER', NOW())`,
  );
  return id;
}

beforeAll(async () => {
  aliceId = await provisionUser(ALICE_EMAIL);
  bobId = await provisionUser(BOB_EMAIL);
  aliceSess = await loginAs(ALICE_EMAIL, PASSWORD, undefined, TENANT_SLUG);
  bobSess = await loginAs(BOB_EMAIL, PASSWORD, undefined, TENANT_SLUG);
});

afterAll(async () => {
  if (aliceId) {
    await execSql(`DELETE FROM "${TENANT_SCHEMA}"."User" WHERE id = '${aliceId}'`).catch(() => {});
    await execSql(
      `DELETE FROM "${TENANT_SCHEMA}"."Organization" WHERE slug = '${ALICE_EMAIL.split("@")[0]}'`,
    ).catch(() => {});
  }
  if (bobId) {
    await execSql(`DELETE FROM "${TENANT_SCHEMA}"."User" WHERE id = '${bobId}'`).catch(() => {});
    await execSql(
      `DELETE FROM "${TENANT_SCHEMA}"."Organization" WHERE slug = '${BOB_EMAIL.split("@")[0]}'`,
    ).catch(() => {});
  }
});

describe("/api/vault/collections — CRUD", () => {
  let aliceCollectionId = "";

  it("GET vide retourne []", async () => {
    const res = await aliceSess.fetch("/api/vault/collections");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.collections).toEqual([]);
  });

  it("POST crée une collection (entryCount=0)", async () => {
    const res = await postJson(aliceSess, "/api/vault/collections", {
      name: "Travail",
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.collection.name).toBe("Travail");
    expect(data.collection.slug).toBe("travail");
    expect(data.collection.entryCount).toBe(0);
    aliceCollectionId = data.collection.id;
  });

  it("POST sans name → 400", async () => {
    const res = await postJson(aliceSess, "/api/vault/collections", {});
    expect(res.status).toBe(400);
  });

  it("POST conflit slug → 409", async () => {
    const res = await postJson(aliceSess, "/api/vault/collections", {
      name: "Travail",
    });
    expect(res.status).toBe(409);
  });

  it("PATCH renomme la collection (slug suit)", async () => {
    const res = await patchJson(
      aliceSess,
      `/api/vault/collections/${aliceCollectionId}`,
      { name: "Boulot" },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.collection.name).toBe("Boulot");
    expect(data.collection.slug).toBe("boulot");
  });

  it("Bob ne voit pas les collections d'Alice", async () => {
    const res = await bobSess.fetch("/api/vault/collections");
    const data = await res.json();
    expect(data.collections).toEqual([]);
  });

  it("Bob ne peut pas DELETE celle d'Alice → 404", async () => {
    const res = await deleteReq(
      bobSess,
      `/api/vault/collections/${aliceCollectionId}`,
    );
    expect(res.status).toBe(404);
  });

  it("DELETE par owner → 200", async () => {
    const res = await deleteReq(
      aliceSess,
      `/api/vault/collections/${aliceCollectionId}`,
    );
    expect(res.status).toBe(200);
  });
});

describe("VaultEntry.collectionId", () => {
  let collId = "";
  let entryWithCollId = "";
  let entryWithoutCollId = "";

  beforeAll(async () => {
    const r = await postJson(aliceSess, "/api/vault/collections", {
      name: "Outils",
    });
    collId = (await r.json()).collection.id;
  });

  it("POST entry avec collectionId valide → 201", async () => {
    const res = await postJson(aliceSess, "/api/vault/entries", {
      name: "Slack",
      url: "https://slack.com",
      username: "alice",
      password: "secret123",
      collectionId: collId,
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.entry.collectionId).toBe(collId);
    entryWithCollId = data.entry.id;
  });

  it("POST entry sans collectionId → null en DB", async () => {
    const res = await postJson(aliceSess, "/api/vault/entries", {
      name: "Netflix",
      password: "secret456",
    });
    const data = await res.json();
    expect(data.entry.collectionId).toBe(null);
    entryWithoutCollId = data.entry.id;
  });

  it("POST entry avec collectionId d'un autre user → 400", async () => {
    // Bob crée sa propre collection
    const r = await postJson(bobSess, "/api/vault/collections", {
      name: "Perso bob",
    });
    const bobCollId = (await r.json()).collection.id;
    // Alice essaie d'y rattacher une entry
    const res = await postJson(aliceSess, "/api/vault/entries", {
      name: "Hack",
      collectionId: bobCollId,
    });
    expect(res.status).toBe(400);
  });

  it("GET ?collectionId=<id> filtre", async () => {
    const res = await aliceSess.fetch(
      `/api/vault/entries?collectionId=${collId}`,
    );
    const data = await res.json();
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].id).toBe(entryWithCollId);
  });

  it("GET ?collectionId=none filtre les sans-catégorie", async () => {
    const res = await aliceSess.fetch("/api/vault/entries?collectionId=none");
    const data = await res.json();
    expect(data.entries.some((e: { id: string }) => e.id === entryWithoutCollId)).toBe(true);
    expect(data.entries.every((e: { collectionId: string | null }) => e.collectionId === null)).toBe(true);
  });

  it("PATCH change collectionId → null (déplace dans 'Sans catégorie')", async () => {
    const res = await patchJson(
      aliceSess,
      `/api/vault/entries/${entryWithCollId}`,
      { collectionId: null },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.entry.collectionId).toBe(null);
  });

  it("DELETE collection → entries préservées avec collectionId=null", async () => {
    // Recrée le rattachement avant le DELETE
    await patchJson(aliceSess, `/api/vault/entries/${entryWithCollId}`, {
      collectionId: collId,
    });

    const del = await deleteReq(aliceSess, `/api/vault/collections/${collId}`);
    expect(del.status).toBe(200);

    // L'entry doit toujours exister mais collectionId=null
    const r = await aliceSess.fetch(
      `/api/vault/entries/${entryWithCollId}`,
    );
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data.entry.collectionId).toBe(null);
  });
});

describe("/api/vault/import — CSV Bitwarden", () => {
  it("dryRun=true ne crée rien et renvoie un sample", async () => {
    const csv = `folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp
"Banques",1,login,"Mon Banque",,,,https://banque.com,me,sec123,
"Banques",,login,"Compte Joint",,,,https://banque.com,joint,sec456,`;
    const res = await postJson(aliceSess, "/api/vault/import", {
      csv,
      dryRun: true,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.format).toBe("bitwarden");
    expect(data.imported).toBe(2);
    expect(data.dryRun).toBe(true);
    expect(data.sample).toHaveLength(2);
  });

  it("import réel crée les collections folder + entries", async () => {
    const csv = `folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp
"Streaming",,login,"Disney+",,,,https://disney.com,me,sec789,
"Streaming",,login,"HBO",,,,https://hbo.com,me,sec012,`;
    const res = await postJson(aliceSess, "/api/vault/import", {
      csv,
      dryRun: false,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.imported).toBe(2);
    expect(data.collectionsCreated).toBe(1);

    // La collection "Streaming" doit exister chez Alice
    const colls = await (await aliceSess.fetch("/api/vault/collections")).json();
    const streaming = colls.collections.find(
      (c: { name: string }) => c.name === "Streaming",
    );
    expect(streaming).toBeDefined();
    expect(streaming.entryCount).toBe(2);
  });

  it("CSV invalide → 400", async () => {
    const res = await postJson(aliceSess, "/api/vault/import", {
      csv: "",
      dryRun: false,
    });
    expect(res.status).toBe(400);
  });
});
