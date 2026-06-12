import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEnvironment } from "@/lib/api";
import { decrypt } from "@/lib/crypto";

type Params = { params: Promise<{ slug: string; env: string }> };

// Suffixes de rôle reconnus dans les noms de secrets DB.
// L'ordre compte : on prend le premier match.
const ROLE_PATTERNS: { pattern: RegExp; role: string }[] = [
  { pattern: /[_-]?HOST(?:NAME)?$/i, role: "host" },
  { pattern: /[_-]?(?:SERVER|ADDR(?:ESS)?)$/i, role: "host" },
  { pattern: /[_-]?PORT$/i, role: "port" },
  { pattern: /[_-]?(?:PASS(?:WORD)?|PWD)$/i, role: "password" },
  { pattern: /[_-]?(?:USER(?:NAME)?|LOGIN)$/i, role: "user" },
  { pattern: /[_-]?(?:DB(?:NAME)?|DATABASE|NAME)$/i, role: "name" },
  { pattern: /[_-]?URL$/i, role: "url" },
];

function extractPrefixAndRole(key: string): { prefix: string; role: string } {
  for (const { pattern, role } of ROLE_PATTERNS) {
    if (pattern.test(key)) {
      const prefix = key.replace(pattern, "").replace(/[_-]+$/, "") || key;
      return { prefix, role };
    }
  }
  return { prefix: key, role: "other" };
}

function detectDbType(prefix: string): string | null {
  const p = prefix.toUpperCase();
  if (p.includes("POSTGRES")) return "POSTGRESQL";
  if (p.includes("MYSQL") || p.includes("MARIADB")) return "MYSQL";
  if (p.includes("MONGO")) return "MONGODB";
  return null;
}

function detectDbTypeFromPort(port: number): string | null {
  if (port === 5432) return "POSTGRESQL";
  if (port === 3306) return "MYSQL";
  if (port === 27017) return "MONGODB";
  return null;
}

// GET /api/projects/[slug]/[env]/secrets/db-detect
// Détecte les groupes de secrets DB dans l'environnement (catégorie = "database")
// et retourne les connexions pré-remplies pour le dialog de rotation.
export async function GET(_req: Request, { params }: Params) {
  const { slug, env } = await params;
  const access = await requireEnvironment(slug, env, "EDITOR");
  if ("error" in access) return access.error;

  const secrets = await prisma.secret.findMany({
    where: { environmentId: access.environment.id, category: "database" },
    select: { id: true, key: true, encryptedValue: true, iv: true, tag: true },
  });

  type GroupEntry = { id: string; key: string; value: string; role: string };
  const groups: Record<string, Record<string, GroupEntry>> = {};

  for (const s of secrets) {
    let value = "";
    try {
      value = decrypt({ encryptedValue: s.encryptedValue, iv: s.iv, tag: s.tag });
    } catch {
      value = "";
    }

    const { prefix, role } = extractPrefixAndRole(s.key);
    if (!groups[prefix]) groups[prefix] = {};
    // Ne pas écraser un rôle déjà trouvé (premiers gagnent)
    if (!groups[prefix][role]) {
      groups[prefix][role] = { id: s.id, key: s.key, value, role };
    }
  }

  const detected = Object.entries(groups).map(([prefix, fields]) => {
    const portNum = fields.port?.value ? Number(fields.port.value) : null;
    const dbType =
      detectDbType(prefix) ??
      (portNum ? detectDbTypeFromPort(portNum) : null);

    return {
      prefix,
      dbHost: fields.host?.value ?? null,
      dbPort: portNum,
      dbName: fields.name?.value ?? null,
      dbType,
      dbUser: fields.user?.value ?? null,
    };
  });

  return NextResponse.json({ detected });
}
