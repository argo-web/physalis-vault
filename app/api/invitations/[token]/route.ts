import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api";
import { hashInvitationToken } from "@/lib/invitations";
import { logAction } from "@/lib/audit";

type Params = { params: Promise<{ token: string }> };

async function findActiveInvitation(token: string) {
  const tokenHash = hashInvitationToken(token);
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: {
      organization: { select: { name: true, slug: true } },
      invitedBy: { select: { email: true } },
    },
  });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
    return null;
  }
  return invitation;
}

// Public: anyone holding the link can fetch the metadata to decide if they
// want to accept. Email is also returned so the UI can hint about the right
// account to log in with.
export async function GET(_req: Request, { params }: Params) {
  const { token } = await params;
  const invitation = await findActiveInvitation(token);
  if (!invitation) {
    return NextResponse.json(
      { error: "Invitation invalid or expired" },
      { status: 404 },
    );
  }
  return NextResponse.json({
    invitation: {
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      organization: invitation.organization,
      invitedBy: invitation.invitedBy,
    },
  });
}

// Authenticated: accept the invitation. The logged-in user must match the
// email the invitation was sent to (case-insensitive).
export async function POST(req: Request, { params }: Params) {
  const { token } = await params;
  const userRes = await requireUser();
  if ("error" in userRes) return userRes.error;

  const invitation = await findActiveInvitation(token);
  if (!invitation) {
    return NextResponse.json(
      { error: "Invitation invalid or expired" },
      { status: 404 },
    );
  }

  const me = await prisma.user.findUnique({
    where: { id: userRes.user.id },
    select: { id: true, email: true },
  });
  if (!me || me.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return NextResponse.json(
      {
        error: "This invitation is for another email address",
        invitedEmail: invitation.email,
      },
      { status: 403 },
    );
  }

  await prisma.$transaction([
    prisma.orgMember.upsert({
      where: {
        userId_organizationId: {
          userId: me.id,
          organizationId: invitation.organizationId,
        },
      },
      create: {
        userId: me.id,
        organizationId: invitation.organizationId,
        role: invitation.role,
      },
      update: { role: invitation.role },
    }),
    prisma.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    }),
  ]);

  logAction({
    action: "MEMBER_INVITE_ACCEPT",
    actor: { kind: "user", userId: me.id, email: me.email },
    organizationId: invitation.organizationId,
    targetType: "Invitation",
    targetId: invitation.id,
    metadata: { role: invitation.role },
    req,
  });

  return NextResponse.json({
    ok: true,
    organization: invitation.organization,
  });
}
