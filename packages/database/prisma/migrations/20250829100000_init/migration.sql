-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'UNINSTALLED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'SUPPORT', 'BILLING');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('IMPORT', 'EXPORT', 'BULK_EDIT', 'UNDO', 'CATALOG_HEALTH_SCAN', 'CONTENT_REWRITE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'MAPPING', 'PREVIEW', 'APPROVED', 'QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LineItemStatus" AS ENUM ('SUCCESS', 'FAILED', 'SKIPPED', 'PREVIEW');

-- CreateEnum
CREATE TYPE "AiOperationType" AS ENUM ('NL_BULK_EDIT', 'COLUMN_MAPPING', 'CATALOG_HEALTH_SCAN', 'CONTENT_REWRITE', 'IMPACT_SUMMARY', 'ANOMALY_DETECTION');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN NOT NULL DEFAULT false,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "shop_domain" TEXT NOT NULL,
    "shop_name" TEXT,
    "plan_id" TEXT,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "product_count" INTEGER NOT NULL DEFAULT 0,
    "sku_count" INTEGER NOT NULL DEFAULT 0,
    "ai_credits_used" INTEGER NOT NULL DEFAULT 0,
    "ai_credits_reset_at" TIMESTAMP(3),
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "role" "AdminRole" NOT NULL DEFAULT 'SUPPORT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "max_products" INTEGER NOT NULL,
    "ai_credits_per_month" INTEGER NOT NULL,
    "scheduled_jobs" BOOLEAN NOT NULL DEFAULT false,
    "cross_platform" BOOLEAN NOT NULL DEFAULT false,
    "multi_store" BOOLEAN NOT NULL DEFAULT false,
    "price_monthly_cents" INTEGER NOT NULL,
    "is_free" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "source_platform" TEXT,
    "target_platform" TEXT,
    "file_name" TEXT,
    "file_path" TEXT,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "mutation_plan" JSONB,
    "diff_preview" JSONB,
    "impact_summary" TEXT,
    "error_summary" TEXT,
    "nl_prompt" TEXT,
    "is_ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "approved_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_snapshots" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "before_state" JSONB NOT NULL,
    "after_state" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_line_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "row_index" INTEGER NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "status" "LineItemStatus" NOT NULL,
    "before_value" JSONB,
    "after_value" JSONB,
    "error_message" TEXT,
    "auto_fix_suggestion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_operations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "job_id" TEXT,
    "operation_type" "AiOperationType" NOT NULL,
    "prompt" TEXT,
    "generated_plan" JSONB,
    "approved_plan" JSONB,
    "credits_consumed" INTEGER NOT NULL DEFAULT 1,
    "model_used" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_field_maps" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "platform_key" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1',
    "name" TEXT NOT NULL,
    "is_global" BOOLEAN NOT NULL DEFAULT false,
    "mappings" JSONB NOT NULL,
    "transforms" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_field_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mapping_templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform_key" TEXT NOT NULL,
    "mappings" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mapping_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_shop_domain_key" ON "tenants"("shop_domain");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");

-- CreateIndex
CREATE UNIQUE INDEX "plans_slug_key" ON "plans"("slug");

-- CreateIndex
CREATE INDEX "jobs_tenant_id_status_idx" ON "jobs"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "jobs_tenant_id_created_at_idx" ON "jobs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "job_snapshots_job_id_idx" ON "job_snapshots"("job_id");

-- CreateIndex
CREATE INDEX "job_snapshots_tenant_id_resource_type_resource_id_idx" ON "job_snapshots"("tenant_id", "resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "job_line_items_job_id_idx" ON "job_line_items"("job_id");

-- CreateIndex
CREATE INDEX "ai_operations_tenant_id_created_at_idx" ON "ai_operations"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "platform_field_maps_platform_key_version_tenant_id_key" ON "platform_field_maps"("platform_key", "version", "tenant_id");

-- CreateIndex
CREATE INDEX "mapping_templates_tenant_id_idx" ON "mapping_templates"("tenant_id");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_snapshots" ADD CONSTRAINT "job_snapshots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_snapshots" ADD CONSTRAINT "job_snapshots_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_line_items" ADD CONSTRAINT "job_line_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_line_items" ADD CONSTRAINT "job_line_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_operations" ADD CONSTRAINT "ai_operations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_operations" ADD CONSTRAINT "ai_operations_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_field_maps" ADD CONSTRAINT "platform_field_maps_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mapping_templates" ADD CONSTRAINT "mapping_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

