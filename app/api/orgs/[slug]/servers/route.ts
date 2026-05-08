import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import {
  isValidServerHost,
  isValidServerName,
  isValidSshPrivateKey,
  isValidSshUser,
  readJson,
  requireOrgMember,
} from "@/lib/api";
import { logAction } from "@/lib/audit";
import { getCurrentTenantSlug } from "@/lib/tenant-session";
import { requireFeature } from "@/lib/feature-guard";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  // DEV+ peut lister les Servers (lecture seule). Création/modification reste ADMIN+.
  const access = await requireOrgMember(slug, "DEV");
  if ("error" in access) return access.error;

  const servers = await prisma.server.findMany({
    where: { organizationId: access.organization.id },
    select: {
      id: true,
      name: true,
      ip: true,
      sshUser: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { environments: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    servers: servers.map((s) => ({
      id: s.id,
      name: s.name,
      ip: s.ip,
      sshUser: s.sshUser,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      environmentCount: s._count.environments,
    })),
  });
}

export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const access = await requireOrgMember(slug, "ADMIN");
  if ("error" in access) return access.error;

  // Phase 5 — gestion serveurs réservée aux plans payants.
  const tenantSlug = await getCurrentTenantSlug();
  const featureGate = await requireFeature("server_management", tenantSlug);
  if (featureGate) return featureGate;

  const body = (await readJson(req)) as
    | { name?: string; ip?: string; sshUser?: string; sshPrivateKey?: string }
    | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const ip = String(body.ip ?? "").trim();
  const sshUser = String(body.sshUser ?? "").trim();
  const sshPrivateKey = String(body.sshPrivateKey ?? "");

  if (!isValidServerName(name)) {
    return NextResponse.json({ error: "Nom invalide" }, { status: 400 });
  }
  if (!isValidServerHost(ip)) {
    return NextResponse.json(
      { error: "IP/hostname invalide" },
      { status: 400 },
    );
  }
  if (!isValidSshUser(sshUser)) {
    return NextResponse.json(
      { error: "Utilisateur SSH invalide" },
      { status: 400 },
    );
  }
  if (!isValidSshPrivateKey(sshPrivateKey)) {
    return NextResponse.json(
      { error: "Clé SSH privée invalide (format PEM/OpenSSH attendu)" },
      { status: 400 },
    );
  }

  const conflict = await prisma.server.findUnique({
    where: {
      organizationId_name: { organizationId: access.organization.id, name },
    },
    select: { id: true },
  });
  if (conflict) {
    return NextResponse.json(
      { error: "Un serveur avec ce nom existe déjà dans l'organisation" },
      { status: 409 },
    );
  }

  const payload = encrypt(sshPrivateKey);
  const server = await prisma.server.create({
    data: {
      name,
      ip,
      sshUser,
      organizationId: access.organization.id,
      encryptedKey: payload.encryptedValue,
      iv: payload.iv,
      tag: payload.tag,
    },
    select: {
      id: true,
      name: true,
      ip: true,
      sshUser: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  logAction({
    action: "SERVER_CREATE",
    actor: { kind: "user", userId: access.user.id, email: access.user.email },
    organizationId: access.organization.id,
    targetType: "Server",
    targetId: server.id,
    metadata: { name: server.name, ip: server.ip, sshUser: server.sshUser },
    req,
  });

  return NextResponse.json({ server }, { status: 201 });
}
