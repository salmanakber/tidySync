ALTER TABLE "plans" ADD COLUMN "audit_log_enabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "plans" SET "audit_log_enabled" = true WHERE "slug" IN ('starter', 'growth', 'advanced');
