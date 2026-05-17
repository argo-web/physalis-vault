-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DatabaseType" AS ENUM ('POSTGRESQL', 'MYSQL', 'MONGODB');

-- CreateEnum
CREATE TYPE "RotationStrategy" AS ENUM ('DATABASE', 'JWT_SECRET', 'WEBHOOK', 'REMINDER');

-- CreateEnum
CREATE TYPE "OrgTokenScope" AS ENUM ('SECRETS_READ', 'SERVICES_READ', 'ACCOUNTS_READ', 'PROJECTS_LIST');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MEMBER', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'DEV', 'MEMBER');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "VaultRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "AccessAction" AS ENUM ('SECRET_CREATE', 'SECRET_UPDATE', 'SECRET_DELETE', 'SECRET_REVEAL', 'SECRET_FETCH_BULK', 'TOKEN_CREATE', 'TOKEN_REVOKE', 'TOKEN_USE_FAILED', 'MEMBER_INVITE', 'MEMBER_INVITE_ACCEPT', 'MEMBER_INVITE_DECLINE', 'MEMBER_ROLE_CHANGE', 'MEMBER_REMOVE', 'PROJECT_CREATE', 'PROJECT_UPDATE', 'PROJECT_DELETE', 'PROJECT_MEMBER_VISIBILITY_CHANGE', 'PROJECT_MEMBER_ROLE_CHANGE', 'ENVIRONMENT_CREATE', 'ENVIRONMENT_UPDATE', 'ENVIRONMENT_DELETE', 'ORG_CREATE', 'ORG_UPDATE', 'ORG_DELETE', 'ORG_SECRET_CREATE', 'ORG_SECRET_UPDATE', 'ORG_SECRET_DELETE', 'ORG_SECRET_REVEAL', 'SERVICE_CREATE', 'SERVICE_UPDATE', 'SERVICE_DELETE', 'SERVICE_REVEAL', 'ACCOUNT_CREATE', 'ACCOUNT_UPDATE', 'ACCOUNT_DELETE', 'ACCOUNT_REVEAL', 'REDEPLOY_TRIGGERED', 'COMPOSE_FETCHED', 'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'TWO_FACTOR_ENABLED', 'TWO_FACTOR_DISABLED', 'TWO_FACTOR_SUCCESS', 'TWO_FACTOR_FAILURE', 'BACKUP_CODE_USED', 'SERVER_CREATE', 'SERVER_UPDATE', 'SERVER_DELETE', 'POLICY_CREATE', 'POLICY_UPDATE', 'POLICY_DELETE', 'DEPLOY_AUTHORIZED', 'DEPLOY_DENIED', 'PLUGIN_AUTH_SUCCESS', 'PLUGIN_AUTH_FAILURE', 'PLUGIN_CREDENTIALS_FETCH', 'PLUGIN_TOKEN_REVOKED', 'VAULT_ENTRY_CREATE', 'VAULT_ENTRY_UPDATE', 'VAULT_ENTRY_DELETE', 'VAULT_ENTRY_REVEAL', 'VAULT_ENTRY_MOVE', 'VAULT_COLLECTION_CREATE', 'VAULT_COLLECTION_DELETE', 'VAULT_MEMBER_ADD', 'VAULT_MEMBER_REMOVE', 'VAULT_MEMBER_ROLE_CHANGE', 'SHARE_CREATE', 'SHARE_CONSUME', 'SHARE_REVOKE', 'SHARE_SEND_EMAIL', 'SHARE_PASSWORD_FAILURE', 'SECRET_REQUEST_CREATED', 'SECRET_REQUEST_SUBMITTED', 'SECRET_REQUEST_REVEALED', 'SECRET_REQUEST_IMPORTED', 'SECRET_REQUEST_REVOKED', 'SECRET_REQUEST_EXPIRED', 'SECRET_VERSION_REVEAL', 'SECRET_ROLLBACK', 'ORG_SECRET_VERSION_REVEAL', 'ORG_SECRET_ROLLBACK', 'VAULT_PERSONAL_COLLECTION_CREATE', 'VAULT_PERSONAL_COLLECTION_DELETE', 'USER_TOKEN_CREATE', 'USER_TOKEN_REVOKE', 'INTEGRATION_CREDENTIALS_FETCH', 'INTEGRATION_PROJECTS_LIST', 'ORG_TOKEN_CREATE', 'ORG_TOKEN_REVOKE', 'ORG_TOKEN_REGENERATE', 'SECRET_ROTATED', 'SECRET_ROTATION_FORCED', 'SECRET_MARKED_ROTATED', 'ROTATION_FEATURE_ENABLED', 'ROTATION_FEATURE_DISABLED', 'DATABASE_CREATE', 'DATABASE_UPDATE', 'DATABASE_DELETE', 'DATABASE_CONNECTION_TEST');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'SHARED', 'DEDICATED');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'PAST_DUE');

-- CreateEnum
CREATE TYPE "TokenKind" AS ENUM ('MACHINE', 'PLUGIN', 'SHARE', 'SECRET_REQUEST', 'USER', 'ORG');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "twoFactorIv" TEXT,
    "twoFactorTag" TEXT,
    "backupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,

    CONSTRAINT "PluginToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "rotationFeatureEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Server" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "sshUser" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgSecret" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgSecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "invitedById" TEXT NOT NULL,
    "inviteeUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "githubRepo" TEXT,
    "githubWorkflow" TEXT,
    "rotationPaused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "workflow" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "encryptedData" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "encryptedData" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT,
    "dockerCompose" TEXT,
    "serverId" TEXT,
    "deployPath" TEXT,

    CONSTRAINT "Environment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Secret" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "environmentId" TEXT NOT NULL,
    "rotationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rotationStrategy" "RotationStrategy",
    "rotationIntervalDays" INTEGER,
    "rotationLastAt" TIMESTAMP(3),
    "rotationNextAt" TIMESTAMP(3),
    "rotationLastStatus" TEXT,
    "rotationErrorCount" INTEGER NOT NULL DEFAULT 0,
    "dbHost" TEXT,
    "dbPort" INTEGER,
    "dbName" TEXT,
    "dbType" "DatabaseType",
    "dbUser" TEXT,
    "rotationWebhookUrl" TEXT,
    "jwtRedeployWebhookUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Secret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecretVersion" (
    "id" TEXT NOT NULL,
    "secretId" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecretVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgSecretVersion" (
    "id" TEXT NOT NULL,
    "orgSecretId" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgSecretVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineToken" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "createdById" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "MachineToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "allProjects" BOOLEAN NOT NULL DEFAULT false,
    "allowedProjectIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedScopes" "OrgTokenScope"[] DEFAULT ARRAY[]::"OrgTokenScope"[],
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'VIEWER',
    "hidden" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "collectionId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "username" TEXT,
    "encryptedPassword" TEXT,
    "passwordIv" TEXT,
    "passwordTag" TEXT,
    "encryptedTotpSecret" TEXT,
    "totpSecretIv" TEXT,
    "totpSecretTag" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultCollection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamVaultCollection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamVaultCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamVaultEntry" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "username" TEXT,
    "encryptedPassword" TEXT,
    "passwordIv" TEXT,
    "passwordTag" TEXT,
    "encryptedTotpSecret" TEXT,
    "totpSecretIv" TEXT,
    "totpSecretTag" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamVaultEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamVaultMember" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "VaultRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamVaultMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "projectId" TEXT,
    "environmentId" TEXT,
    "actorUserId" TEXT,
    "actorUserEmail" TEXT,
    "actorTokenId" TEXT,
    "actorTokenName" TEXT,
    "action" "AccessAction" NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "secretKey" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OneTimeShare" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "title" TEXT,
    "passwordHash" TEXT,
    "passwordAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdByEmail" TEXT NOT NULL,
    "organizationId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "viewedFromIp" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OneTimeShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecretRequest" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "requestedById" TEXT,
    "requestedByEmail" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "environmentName" TEXT,
    "secretKey" TEXT,
    "publicKeyJwk" TEXT NOT NULL,
    "encryptedSecret" TEXT,
    "secretIv" TEXT,
    "ephemeralPublicKey" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submitterIp" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "viewedAt" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecretRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'DEDICATED',
    "max_orgs" INTEGER NOT NULL DEFAULT 99,
    "max_users" INTEGER NOT NULL DEFAULT 999,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "trial_ends_at" TIMESTAMP(3),
    "comped" BOOLEAN NOT NULL DEFAULT true,
    "comped_reason" VARCHAR(255),
    "stripe_customer_id" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "plan" "Plan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "stripe_subscription_id" VARCHAR(255),
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID,
    "action" VARCHAR(255) NOT NULL,
    "actor" VARCHAR(255) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenIndex" (
    "token_hash" TEXT NOT NULL,
    "tenant_slug" VARCHAR(100) NOT NULL,
    "kind" "TokenKind" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenIndex_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_hash" VARCHAR(64) NOT NULL,
    "tenant_slug" VARCHAR(100),
    "user_id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OidcPolicy" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "repo" TEXT NOT NULL,
    "workflow" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "tenant_slug" VARCHAR(100) NOT NULL,
    "project_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OidcPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PluginToken_tokenHash_key" ON "PluginToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PluginToken_userId_idx" ON "PluginToken"("userId");

-- CreateIndex
CREATE INDEX "PluginToken_expiresAt_idx" ON "PluginToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Server_organizationId_idx" ON "Server"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Server_organizationId_name_key" ON "Server"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "OrgSecret_organizationId_key_key" ON "OrgSecret"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "OrgMember_userId_organizationId_key" ON "OrgMember"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_organizationId_idx" ON "Invitation"("organizationId");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE INDEX "Invitation_inviteeUserId_idx" ON "Invitation"("inviteeUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE INDEX "Project_organizationId_idx" ON "Project"("organizationId");

-- CreateIndex
CREATE INDEX "Policy_repo_workflow_branch_idx" ON "Policy"("repo", "workflow", "branch");

-- CreateIndex
CREATE INDEX "Policy_projectId_idx" ON "Policy"("projectId");

-- CreateIndex
CREATE INDEX "Policy_environmentId_idx" ON "Policy"("environmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_repo_workflow_branch_projectId_environmentId_key" ON "Policy"("repo", "workflow", "branch", "projectId", "environmentId");

-- CreateIndex
CREATE INDEX "Service_projectId_idx" ON "Service"("projectId");

-- CreateIndex
CREATE INDEX "AppAccount_projectId_idx" ON "AppAccount"("projectId");

-- CreateIndex
CREATE INDEX "Environment_serverId_idx" ON "Environment"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "Environment_projectId_name_key" ON "Environment"("projectId", "name");

-- CreateIndex
CREATE INDEX "Secret_rotationNextAt_idx" ON "Secret"("rotationNextAt");

-- CreateIndex
CREATE UNIQUE INDEX "Secret_environmentId_key_key" ON "Secret"("environmentId", "key");

-- CreateIndex
CREATE INDEX "SecretVersion_secretId_version_idx" ON "SecretVersion"("secretId", "version" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "SecretVersion_secretId_version_key" ON "SecretVersion"("secretId", "version");

-- CreateIndex
CREATE INDEX "OrgSecretVersion_orgSecretId_version_idx" ON "OrgSecretVersion"("orgSecretId", "version" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "OrgSecretVersion_orgSecretId_version_key" ON "OrgSecretVersion"("orgSecretId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "MachineToken_tokenHash_key" ON "MachineToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "UserToken_tokenHash_key" ON "UserToken"("tokenHash");

-- CreateIndex
CREATE INDEX "UserToken_userId_idx" ON "UserToken"("userId");

-- CreateIndex
CREATE INDEX "UserToken_expiresAt_idx" ON "UserToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrgToken_tokenHash_key" ON "OrgToken"("tokenHash");

-- CreateIndex
CREATE INDEX "OrgToken_organizationId_idx" ON "OrgToken"("organizationId");

-- CreateIndex
CREATE INDEX "OrgToken_expiresAt_idx" ON "OrgToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_userId_projectId_key" ON "ProjectMember"("userId", "projectId");

-- CreateIndex
CREATE INDEX "VaultEntry_userId_idx" ON "VaultEntry"("userId");

-- CreateIndex
CREATE INDEX "VaultEntry_collectionId_idx" ON "VaultEntry"("collectionId");

-- CreateIndex
CREATE INDEX "VaultCollection_userId_idx" ON "VaultCollection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VaultCollection_userId_slug_key" ON "VaultCollection"("userId", "slug");

-- CreateIndex
CREATE INDEX "TeamVaultCollection_organizationId_idx" ON "TeamVaultCollection"("organizationId");

-- CreateIndex
CREATE INDEX "TeamVaultCollection_projectId_idx" ON "TeamVaultCollection"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamVaultCollection_organizationId_slug_key" ON "TeamVaultCollection"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "TeamVaultCollection_projectId_slug_key" ON "TeamVaultCollection"("projectId", "slug");

-- CreateIndex
CREATE INDEX "TeamVaultEntry_collectionId_idx" ON "TeamVaultEntry"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamVaultMember_collectionId_userId_key" ON "TeamVaultMember"("collectionId", "userId");

-- CreateIndex
CREATE INDEX "AccessLog_organizationId_createdAt_idx" ON "AccessLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AccessLog_projectId_createdAt_idx" ON "AccessLog"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AccessLog_actorUserId_createdAt_idx" ON "AccessLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AccessLog_action_createdAt_idx" ON "AccessLog"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OneTimeShare_tokenHash_key" ON "OneTimeShare"("tokenHash");

-- CreateIndex
CREATE INDEX "OneTimeShare_createdById_idx" ON "OneTimeShare"("createdById");

-- CreateIndex
CREATE INDEX "OneTimeShare_expiresAt_idx" ON "OneTimeShare"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SecretRequest_tokenHash_key" ON "SecretRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "SecretRequest_organizationId_idx" ON "SecretRequest"("organizationId");

-- CreateIndex
CREATE INDEX "SecretRequest_projectId_idx" ON "SecretRequest"("projectId");

-- CreateIndex
CREATE INDEX "SecretRequest_expiresAt_idx" ON "SecretRequest"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Client_slug_key" ON "Client"("slug");

-- CreateIndex
CREATE INDEX "Subscription_client_id_idx" ON "Subscription"("client_id");

-- CreateIndex
CREATE INDEX "AuditLog_client_id_created_at_idx" ON "AuditLog"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "AuditLog_action_created_at_idx" ON "AuditLog"("action", "created_at");

-- CreateIndex
CREATE INDEX "TokenIndex_tenant_slug_kind_idx" ON "TokenIndex"("tenant_slug", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_hash_key" ON "PasswordResetToken"("token_hash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_email_idx" ON "PasswordResetToken"("email");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expires_at_idx" ON "PasswordResetToken"("expires_at");

-- CreateIndex
CREATE INDEX "OidcPolicy_repo_workflow_branch_idx" ON "OidcPolicy"("repo", "workflow", "branch");

-- CreateIndex
CREATE INDEX "OidcPolicy_tenant_slug_project_id_idx" ON "OidcPolicy"("tenant_slug", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "OidcPolicy_repo_workflow_branch_tenant_slug_project_id_envi_key" ON "OidcPolicy"("repo", "workflow", "branch", "tenant_slug", "project_id", "environment_id");

-- AddForeignKey
ALTER TABLE "PluginToken" ADD CONSTRAINT "PluginToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgSecret" ADD CONSTRAINT "OrgSecret_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_inviteeUserId_fkey" FOREIGN KEY ("inviteeUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppAccount" ADD CONSTRAINT "AppAccount_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Environment" ADD CONSTRAINT "Environment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Environment" ADD CONSTRAINT "Environment_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Secret" ADD CONSTRAINT "Secret_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecretVersion" ADD CONSTRAINT "SecretVersion_secretId_fkey" FOREIGN KEY ("secretId") REFERENCES "Secret"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecretVersion" ADD CONSTRAINT "SecretVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgSecretVersion" ADD CONSTRAINT "OrgSecretVersion_orgSecretId_fkey" FOREIGN KEY ("orgSecretId") REFERENCES "OrgSecret"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgSecretVersion" ADD CONSTRAINT "OrgSecretVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineToken" ADD CONSTRAINT "MachineToken_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineToken" ADD CONSTRAINT "MachineToken_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineToken" ADD CONSTRAINT "MachineToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserToken" ADD CONSTRAINT "UserToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgToken" ADD CONSTRAINT "OrgToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgToken" ADD CONSTRAINT "OrgToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultEntry" ADD CONSTRAINT "VaultEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultEntry" ADD CONSTRAINT "VaultEntry_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "VaultCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultCollection" ADD CONSTRAINT "VaultCollection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamVaultCollection" ADD CONSTRAINT "TeamVaultCollection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamVaultCollection" ADD CONSTRAINT "TeamVaultCollection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamVaultEntry" ADD CONSTRAINT "TeamVaultEntry_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "TeamVaultCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamVaultMember" ADD CONSTRAINT "TeamVaultMember_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "TeamVaultCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamVaultMember" ADD CONSTRAINT "TeamVaultMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneTimeShare" ADD CONSTRAINT "OneTimeShare_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneTimeShare" ADD CONSTRAINT "OneTimeShare_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecretRequest" ADD CONSTRAINT "SecretRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecretRequest" ADD CONSTRAINT "SecretRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecretRequest" ADD CONSTRAINT "SecretRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
