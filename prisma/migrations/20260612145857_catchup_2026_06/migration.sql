/*
  Warnings:

  - You are about to drop the `OidcPolicy` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "BackupDbType" AS ENUM ('POSTGRESQL', 'MYSQL', 'MARIADB');

-- CreateEnum
CREATE TYPE "BackupEntryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "ProjectDocKind" AS ENUM ('README', 'TECHNICAL', 'SECURITY');

-- CreateEnum
CREATE TYPE "ApiValidationMode" AS ENUM ('REMOTE', 'JWT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccessAction" ADD VALUE 'API_CREATED';
ALTER TYPE "AccessAction" ADD VALUE 'API_UPDATED';
ALTER TYPE "AccessAction" ADD VALUE 'API_DELETED';
ALTER TYPE "AccessAction" ADD VALUE 'API_KEY_CREATED';
ALTER TYPE "AccessAction" ADD VALUE 'API_KEY_UPDATED';
ALTER TYPE "AccessAction" ADD VALUE 'API_KEY_REVOKED';
ALTER TYPE "AccessAction" ADD VALUE 'BACKUP_ENABLED';
ALTER TYPE "AccessAction" ADD VALUE 'BACKUP_DISABLED';
ALTER TYPE "AccessAction" ADD VALUE 'BACKUP_CONFIG_UPDATED';
ALTER TYPE "AccessAction" ADD VALUE 'BACKUP_SUCCESS';
ALTER TYPE "AccessAction" ADD VALUE 'BACKUP_FAILED';
ALTER TYPE "AccessAction" ADD VALUE 'BACKUP_FORCED';
ALTER TYPE "AccessAction" ADD VALUE 'BACKUP_KEY_REVEAL';

-- AlterEnum
ALTER TYPE "OrgRole" ADD VALUE 'ADMIN_DEV';

-- AlterEnum
ALTER TYPE "RotationStrategy" ADD VALUE 'API_KEY';

-- AlterTable
ALTER TABLE "OrgSecret" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "extraEmails" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isPrimary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxEmailsPerMonth" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "maxOidcProjects" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "maxSeats" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "maxServers" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "docsFetchedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Secret" ADD COLUMN     "apiKeyId" TEXT,
ADD COLUMN     "rotationNeedsFullDeploy" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SecretRequest" ADD COLUMN     "hybridVersion" INTEGER,
ADD COLUMN     "mlkemCiphertext" TEXT,
ADD COLUMN     "mlkemPublicKey" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionsValidFrom" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "VaultEntry" ADD COLUMN     "passwordStrength" INTEGER;

-- DropTable
DROP TABLE "OidcPolicy";

-- CreateTable
CREATE TABLE "ClientEmailConfig" (
    "id" TEXT NOT NULL,
    "tenantSlug" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "accountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientEmailConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientBackupConfig" (
    "id" TEXT NOT NULL,
    "tenantSlug" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "backupServerId" TEXT,
    "backupPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientBackupConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectBackupConfig" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "environmentName" TEXT NOT NULL,
    "gpgPublicKey" TEXT,
    "gpgKeyId" TEXT,
    "agentRegisteredAt" TIMESTAMP(3),
    "agentTokenHash" TEXT,
    "agentTokenEnc" TEXT,
    "agentTokenIv" TEXT,
    "agentTokenTag" TEXT,
    "overdueAlertedAt" TIMESTAMP(3),
    "retentionDaily" INTEGER NOT NULL DEFAULT 7,
    "retentionWeekly" INTEGER NOT NULL DEFAULT 4,
    "retentionMonthly" INTEGER NOT NULL DEFAULT 3,
    "scheduleHour" INTEGER NOT NULL DEFAULT 3,
    "intervalDays" INTEGER NOT NULL DEFAULT 1,
    "backupNextAt" TIMESTAMP(3),
    "backupLastAt" TIMESTAMP(3),
    "backupLastStatus" TEXT,
    "backupErrorCount" INTEGER NOT NULL DEFAULT 0,
    "forceRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBackupConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectBackupDatabase" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "dbType" "BackupDbType" NOT NULL,
    "dbName" TEXT NOT NULL,
    "dbHost" TEXT NOT NULL,
    "dbUser" TEXT NOT NULL,
    "passwordSecretKey" TEXT,
    "port" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBackupDatabase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectBackupEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sizeBytes" BIGINT,
    "dbType" "BackupDbType" NOT NULL,
    "dbName" TEXT NOT NULL,
    "environmentName" TEXT NOT NULL,
    "destLocation" TEXT NOT NULL,
    "status" "BackupEntryStatus" NOT NULL,
    "errorMessage" TEXT,
    "restorable" BOOLEAN NOT NULL DEFAULT true,
    "restoreJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectBackupEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectEmailConfig" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "dnsRecords" JSONB NOT NULL DEFAULT '[]',
    "rotationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rotationIntervalDays" INTEGER,
    "rotationNextAt" TIMESTAMP(3),
    "rotationLastAt" TIMESTAMP(3),
    "rotationLastStatus" TEXT,
    "rotationErrorCount" INTEGER NOT NULL DEFAULT 0,
    "pendingRevokeKeyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectEmailConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDoc" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ProjectDocKind" NOT NULL,
    "content" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Api" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "mode" "ApiValidationMode" NOT NULL DEFAULT 'REMOTE',
    "jwtSecret" TEXT,
    "jwtSecretIv" TEXT,
    "jwtSecretTag" TEXT,
    "defaultRateLimit" INTEGER,
    "defaultRateLimitWindow" TEXT NOT NULL DEFAULT '1m',
    "defaultExpiresIn" INTEGER,
    "liveEnvId" TEXT,
    "testEnvId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Api_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "apiId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scopes" TEXT[],
    "rateLimit" INTEGER,
    "rateLimitWindow" TEXT,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiLog" (
    "id" TEXT NOT NULL,
    "apiId" TEXT NOT NULL,
    "keyId" TEXT,
    "keyPrefix" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "valid" BOOLEAN NOT NULL,
    "reason" TEXT,
    "statusCode" INTEGER,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientEmailConfig_tenantSlug_key" ON "ClientEmailConfig"("tenantSlug");

-- CreateIndex
CREATE UNIQUE INDEX "ClientBackupConfig_tenantSlug_key" ON "ClientBackupConfig"("tenantSlug");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBackupConfig_projectId_key" ON "ProjectBackupConfig"("projectId");

-- CreateIndex
CREATE INDEX "ProjectBackupDatabase_configId_idx" ON "ProjectBackupDatabase"("configId");

-- CreateIndex
CREATE INDEX "ProjectBackupEntry_projectId_createdAt_idx" ON "ProjectBackupEntry"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ProjectBackupEntry_projectId_status_idx" ON "ProjectBackupEntry"("projectId", "status");

-- CreateIndex
CREATE INDEX "ProjectBackupEntry_configId_idx" ON "ProjectBackupEntry"("configId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectEmailConfig_projectId_key" ON "ProjectEmailConfig"("projectId");

-- CreateIndex
CREATE INDEX "ProjectEmailConfig_rotationNextAt_idx" ON "ProjectEmailConfig"("rotationNextAt");

-- CreateIndex
CREATE INDEX "ProjectDoc_projectId_idx" ON "ProjectDoc"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectDoc_projectId_kind_key" ON "ProjectDoc"("projectId", "kind");

-- CreateIndex
CREATE INDEX "Api_projectId_idx" ON "Api"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Api_projectId_name_key" ON "Api"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_apiId_idx" ON "ApiKey"("apiId");

-- CreateIndex
CREATE INDEX "ApiLog_apiId_createdAt_idx" ON "ApiLog"("apiId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ApiLog_keyId_createdAt_idx" ON "ApiLog"("keyId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "ClientBackupConfig" ADD CONSTRAINT "ClientBackupConfig_backupServerId_fkey" FOREIGN KEY ("backupServerId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBackupConfig" ADD CONSTRAINT "ProjectBackupConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBackupDatabase" ADD CONSTRAINT "ProjectBackupDatabase_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ProjectBackupConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBackupEntry" ADD CONSTRAINT "ProjectBackupEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBackupEntry" ADD CONSTRAINT "ProjectBackupEntry_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ProjectBackupConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEmailConfig" ADD CONSTRAINT "ProjectEmailConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDoc" ADD CONSTRAINT "ProjectDoc_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Secret" ADD CONSTRAINT "Secret_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Api" ADD CONSTRAINT "Api_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Api" ADD CONSTRAINT "Api_liveEnvId_fkey" FOREIGN KEY ("liveEnvId") REFERENCES "Environment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Api" ADD CONSTRAINT "Api_testEnvId_fkey" FOREIGN KEY ("testEnvId") REFERENCES "Environment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_apiId_fkey" FOREIGN KEY ("apiId") REFERENCES "Api"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiLog" ADD CONSTRAINT "ApiLog_apiId_fkey" FOREIGN KEY ("apiId") REFERENCES "Api"("id") ON DELETE CASCADE ON UPDATE CASCADE;
