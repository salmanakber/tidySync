-- Extended features: schedules, flags, integrations, API keys, approvals, linked stores, notifications

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "extra_ai_credits" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "IntegrationType" AS ENUM ('FTP', 'SFTP', 'GOOGLE_DRIVE', 'DROPBOX', 'GOOGLE_SHEETS', 'SLACK', 'EMAIL');

CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE IF NOT EXISTS "scheduled_jobs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "job_type" "JobType" NOT NULL,
    "schedule" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMP(3),
    "next_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "scheduled_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "feature_flags" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "tenant_id" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tenant_integrations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenant_integrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "api_keys" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "approval_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "requested_by" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "impact_threshold" INTEGER,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "linked_stores" (
    "id" TEXT NOT NULL,
    "agency_tenant_id" TEXT NOT NULL,
    "linked_shop_domain" TEXT NOT NULL,
    "linked_tenant_id" TEXT,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "linked_stores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "notification_settings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "email" TEXT,
    "email_on_complete" BOOLEAN NOT NULL DEFAULT true,
    "email_on_failure" BOOLEAN NOT NULL DEFAULT true,
    "slack_webhook" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "feature_flags_key_tenant_id_key" ON "feature_flags"("key", "tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_integrations_tenant_id_type_key" ON "tenant_integrations"("tenant_id", "type");
CREATE INDEX IF NOT EXISTS "api_keys_key_prefix_idx" ON "api_keys"("key_prefix");
CREATE UNIQUE INDEX IF NOT EXISTS "approval_requests_job_id_key" ON "approval_requests"("job_id");
CREATE INDEX IF NOT EXISTS "approval_requests_tenant_id_status_idx" ON "approval_requests"("tenant_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "linked_stores_agency_tenant_id_linked_shop_domain_key" ON "linked_stores"("agency_tenant_id", "linked_shop_domain");
CREATE UNIQUE INDEX IF NOT EXISTS "notification_settings_tenant_id_key" ON "notification_settings"("tenant_id");
CREATE INDEX IF NOT EXISTS "scheduled_jobs_tenant_id_enabled_idx" ON "scheduled_jobs"("tenant_id", "enabled");

ALTER TABLE "scheduled_jobs" ADD CONSTRAINT "scheduled_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_integrations" ADD CONSTRAINT "tenant_integrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "linked_stores" ADD CONSTRAINT "linked_stores_agency_tenant_id_fkey" FOREIGN KEY ("agency_tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
