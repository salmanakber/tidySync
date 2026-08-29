-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('ACTIVE', 'PENDING_APPROVAL', 'DECLINED', 'FROZEN');

-- CreateEnum
CREATE TYPE "BillingChargeType" AS ENUM ('RECURRING', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "BillingChargeStatus" AS ENUM ('PENDING', 'ACTIVE', 'DECLINED', 'EXPIRED');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "shopify_subscription_id" TEXT,
ADD COLUMN "billing_status" "BillingStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "plans" ADD COLUMN "shopify_plan_name" TEXT;

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "resource_type" TEXT NOT NULL DEFAULT 'products';

-- CreateTable
CREATE TABLE "billing_charges" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" "BillingChargeType" NOT NULL,
    "shopify_charge_id" TEXT NOT NULL,
    "status" "BillingChargeStatus" NOT NULL DEFAULT 'PENDING',
    "amount_cents" INTEGER NOT NULL,
    "credits_granted" INTEGER,
    "plan_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMP(3),

    CONSTRAINT "billing_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_charges_tenant_id_created_at_idx" ON "billing_charges"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "billing_charges_shopify_charge_id_idx" ON "billing_charges"("shopify_charge_id");

-- AddForeignKey
ALTER TABLE "billing_charges" ADD CONSTRAINT "billing_charges_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_charges" ADD CONSTRAINT "billing_charges_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
