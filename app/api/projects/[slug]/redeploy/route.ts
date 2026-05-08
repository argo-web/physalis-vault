import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import {
  isValidEnvName,
  readJson,
  requireProjectMember,
} from "@/lib/api";
import { logAction } from "@/lib/audit";

type Params = { params: Promise<{ slug: string }> };

const GITHUB_TOKEN_KEY = "GITHUB_DISPATCH_TOKEN";
const DEFAULT_WORKFLOW = "redeploy.yml";

/**
 * Trigger a GitHub Actions workflow_dispatch for the project's configured
 * repo + workflow. The PAT is read from the org-level OrgSecret named
 * GITHUB_DISPATCH_TOKEN. The token never leaves the server.
 *
 * Body: { environment: string }
 * Auth: session, EDITOR+
 */
export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const access = await requireProjectMember(slug, "EDITOR");
  if ("error" in access) return access.error;

  const body = (await readJson(req)) as { environment?: string } | null;
  const envName = body?.environment?.trim().toLowerCase() ?? "";
  if (!isValidEnvName(envName)) {
    return NextResponse.json(
      { error: "environment is required" },
      { status: 400 },
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: access.project.id },
    select: {
      id: true,
      githubRepo: true,
      githubWorkflow: true,
      organizationId: true,
    },
  });
  if (!project?.githubRepo) {
    return NextResponse.json(
      {
        error:
          "GitHub repo non configuré pour ce projet. Renseignez githubRepo dans les paramètres.",
      },
      { status: 400 },
    );
  }

  const tokenRow = await prisma.orgSecret.findUnique({
    where: {
      organizationId_key: {
        organizationId: project.organizationId,
        key: GITHUB_TOKEN_KEY,
      },
    },
  });
  if (!tokenRow) {
    return NextResponse.json(
      {
        error: `Aucun secret org \`${GITHUB_TOKEN_KEY}\` configuré. Ajoutez-le dans les paramètres de l'organisation.`,
      },
      { status: 400 },
    );
  }

  const token = decrypt({
    encryptedValue: tokenRow.encryptedValue,
    iv: tokenRow.iv,
    tag: tokenRow.tag,
  });

  const workflow = project.githubWorkflow ?? DEFAULT_WORKFLOW;
  const url = `https://api.github.com/repos/${project.githubRepo}/actions/workflows/${encodeURIComponent(
    workflow,
  )}/dispatches`;

  const ghRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "SecretVault-Redeploy",
    },
    body: JSON.stringify({
      ref: "main",
      inputs: { environment: envName },
    }),
  });

  // GitHub returns 204 No Content on success.
  if (!ghRes.ok) {
    const text = await ghRes.text().catch(() => "");
    logAction({
      action: "REDEPLOY_TRIGGERED",
      actor: { kind: "user", userId: access.user.id, email: access.user.email },
      organizationId: project.organizationId,
      projectId: project.id,
      targetType: "Project",
      targetId: project.id,
      metadata: {
        repo: project.githubRepo,
        workflow,
        environment: envName,
        status: "failed",
        httpStatus: ghRes.status,
        githubError: text.slice(0, 500),
      },
      req,
    });
    return NextResponse.json(
      {
        error: `GitHub a refuse le dispatch (HTTP ${ghRes.status})`,
        details: text.slice(0, 500),
      },
      { status: 502 },
    );
  }

  logAction({
    action: "REDEPLOY_TRIGGERED",
    actor: { kind: "user", userId: access.user.id, email: access.user.email },
    organizationId: project.organizationId,
    projectId: project.id,
    targetType: "Project",
    targetId: project.id,
    metadata: {
      repo: project.githubRepo,
      workflow,
      environment: envName,
      status: "success",
    },
    req,
  });

  return NextResponse.json({ ok: true, repo: project.githubRepo, workflow });
}
