-- Plan limits for backups and AI agent
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "max_backups" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "backup_retention_days" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "max_backup_products" INTEGER NOT NULL DEFAULT 250;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "agent_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "agent_runs_per_month" INTEGER NOT NULL DEFAULT 0;

-- Tenant agent usage
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "agent_runs_used" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "agent_runs_reset_at" TIMESTAMP(3);

-- Job types
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'BACKUP';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'AGENT_RUN';

-- AI operation types
ALTER TYPE "AiOperationType" ADD VALUE IF NOT EXISTS 'AGENT_RUN';
ALTER TYPE "AiOperationType" ADD VALUE IF NOT EXISTS 'STORE_BACKUP';

-- Store backups table
CREATE TABLE IF NOT EXISTS "store_backups" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "file_path" TEXT NOT NULL,
  "product_count" INTEGER NOT NULL DEFAULT 0,
  "size_bytes" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "job_id" TEXT,
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_backups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "store_backups_tenant_id_created_at_idx" ON "store_backups"("tenant_id", "created_at");

ALTER TABLE "store_backups" DROP CONSTRAINT IF EXISTS "store_backups_tenant_id_fkey";
ALTER TABLE "store_backups" ADD CONSTRAINT "store_backups_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed plan limits (upsert via slug)
UPDATE "plans" SET "max_backups" = 1, "backup_retention_days" = 7, "max_backup_products" = 250, "agent_enabled" = false, "agent_runs_per_month" = 0 WHERE "slug" = 'free';
UPDATE "plans" SET "max_backups" = 3, "backup_retention_days" = 14, "max_backup_products" = 2000, "agent_enabled" = true, "agent_runs_per_month" = 10 WHERE "slug" = 'starter';
UPDATE "plans" SET "max_backups" = 10, "backup_retention_days" = 30, "max_backup_products" = 10000, "agent_enabled" = true, "agent_runs_per_month" = 50 WHERE "slug" = 'growth';
UPDATE "plans" SET "max_backups" = 50, "backup_retention_days" = 90, "max_backup_products" = 999999, "agent_enabled" = true, "agent_runs_per_month" = 200 WHERE "slug" = 'advanced';
