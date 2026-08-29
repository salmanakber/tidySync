-- Tenant admin controls: billing bypass, install approval, notes
ALTER TABLE "tenants" ADD COLUMN "billing_bypass" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN "install_approved" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "tenants" ADD COLUMN "admin_notes" TEXT;
