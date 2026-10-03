-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('SYSTEM', 'FIRM');

-- AlterTable: add the new nullable role foreign key while the legacy column still exists
ALTER TABLE "User" ADD COLUMN "roleId" TEXT;

-- Backfill each user's roleId from the legacy role column
UPDATE "User" SET "roleId" = CASE "role"
    WHEN 'SUPER_ADMIN' THEN 'sys-role-super-admin'
    WHEN 'FIRM_ADMIN' THEN 'sys-role-firm-admin'
    WHEN 'FILER' THEN 'sys-role-filer'
    ELSE NULL
END;

-- Drop the legacy role column, index and enum now that data is migrated.
-- The old enum type is named "Role", so it must be dropped before the new
-- "Role" table can be created.
DROP INDEX "User_role_idx";
ALTER TABLE "User" DROP COLUMN "role";
DROP TYPE "Role";

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "RoleScope" NOT NULL DEFAULT 'FIRM',
    "firmId" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Role_scope_idx" ON "Role"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "Role_firmId_key_key" ON "Role"("firmId", "key");

-- CreateIndex
CREATE INDEX "RolePermission_permission_idx" ON "RolePermission"("permission");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permission_key" ON "RolePermission"("roleId", "permission");

-- Seed built-in system roles
INSERT INTO "Role" ("id", "key", "name", "description", "scope", "firmId", "isSystem", "createdAt", "updatedAt") VALUES
    ('sys-role-super-admin', 'SUPER_ADMIN', 'Super admin', NULL, 'SYSTEM', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('sys-role-firm-admin', 'FIRM_ADMIN', 'Firm admin', NULL, 'SYSTEM', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('sys-role-filer', 'FILER', 'Filer', NULL, 'SYSTEM', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Seed the default permission set for each system role
INSERT INTO "RolePermission" ("id", "roleId", "permission")
SELECT md5(random()::text || clock_timestamp()::text), r."id", v."permission"
FROM (VALUES
    -- SUPER_ADMIN: every permission (platform + firm)
    ('SUPER_ADMIN', 'clients:read'),
    ('SUPER_ADMIN', 'clients:write'),
    ('SUPER_ADMIN', 'clients:delete'),
    ('SUPER_ADMIN', 'consents:manage'),
    ('SUPER_ADMIN', 'filings:read'),
    ('SUPER_ADMIN', 'filings:write'),
    ('SUPER_ADMIN', 'returns:read'),
    ('SUPER_ADMIN', 'returns:write'),
    ('SUPER_ADMIN', 'invoices:read'),
    ('SUPER_ADMIN', 'invoices:write'),
    ('SUPER_ADMIN', 'documents:read'),
    ('SUPER_ADMIN', 'documents:write'),
    ('SUPER_ADMIN', 'devices:read'),
    ('SUPER_ADMIN', 'devices:manage'),
    ('SUPER_ADMIN', 'sms:read'),
    ('SUPER_ADMIN', 'sms:classify'),
    ('SUPER_ADMIN', 'billing:read'),
    ('SUPER_ADMIN', 'billing:manage'),
    ('SUPER_ADMIN', 'payments:read'),
    ('SUPER_ADMIN', 'payments:manage'),
    ('SUPER_ADMIN', 'users:read'),
    ('SUPER_ADMIN', 'users:manage'),
    ('SUPER_ADMIN', 'roles:read'),
    ('SUPER_ADMIN', 'roles:manage'),
    ('SUPER_ADMIN', 'audit:read'),
    ('SUPER_ADMIN', 'firms:read'),
    ('SUPER_ADMIN', 'firms:manage'),
    ('SUPER_ADMIN', 'releases:read'),
    ('SUPER_ADMIN', 'releases:manage'),
    ('SUPER_ADMIN', 'platform_billing:read'),
    -- FIRM_ADMIN: all firm-scoped permissions
    ('FIRM_ADMIN', 'clients:read'),
    ('FIRM_ADMIN', 'clients:write'),
    ('FIRM_ADMIN', 'clients:delete'),
    ('FIRM_ADMIN', 'consents:manage'),
    ('FIRM_ADMIN', 'filings:read'),
    ('FIRM_ADMIN', 'filings:write'),
    ('FIRM_ADMIN', 'returns:read'),
    ('FIRM_ADMIN', 'returns:write'),
    ('FIRM_ADMIN', 'invoices:read'),
    ('FIRM_ADMIN', 'invoices:write'),
    ('FIRM_ADMIN', 'documents:read'),
    ('FIRM_ADMIN', 'documents:write'),
    ('FIRM_ADMIN', 'devices:read'),
    ('FIRM_ADMIN', 'devices:manage'),
    ('FIRM_ADMIN', 'sms:read'),
    ('FIRM_ADMIN', 'sms:classify'),
    ('FIRM_ADMIN', 'billing:read'),
    ('FIRM_ADMIN', 'billing:manage'),
    ('FIRM_ADMIN', 'payments:read'),
    ('FIRM_ADMIN', 'payments:manage'),
    ('FIRM_ADMIN', 'users:read'),
    ('FIRM_ADMIN', 'users:manage'),
    ('FIRM_ADMIN', 'roles:read'),
    ('FIRM_ADMIN', 'roles:manage'),
    ('FIRM_ADMIN', 'audit:read'),
    -- FILER: operational permissions
    ('FILER', 'clients:read'),
    ('FILER', 'consents:manage'),
    ('FILER', 'filings:read'),
    ('FILER', 'filings:write'),
    ('FILER', 'returns:read'),
    ('FILER', 'returns:write'),
    ('FILER', 'invoices:read'),
    ('FILER', 'invoices:write'),
    ('FILER', 'documents:read'),
    ('FILER', 'documents:write'),
    ('FILER', 'devices:read'),
    ('FILER', 'devices:manage'),
    ('FILER', 'sms:read'),
    ('FILER', 'sms:classify'),
    ('FILER', 'billing:read'),
    ('FILER', 'billing:manage'),
    ('FILER', 'payments:read'),
    ('FILER', 'payments:manage'),
    ('FILER', 'audit:read')
) AS v("role_key", "permission")
JOIN "Role" r ON r."key" = v."role_key" AND r."firmId" IS NULL;

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
